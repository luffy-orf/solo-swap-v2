import { NextResponse } from 'next/server';
import { db } from '@/app/lib/firebase';
import { encryptionService } from '@/app/lib/encryption';
import { collection, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';

interface UserRecord {
  anonymizedKey: string;
  mode: 'single' | 'multisig';
  publicKey: string;
}

async function fetchAllUsers(): Promise<UserRecord[]> {
  const usersSnapshot = await getDocs(collection(db, 'users'));
  const users: UserRecord[] = [];

  usersSnapshot.forEach((userDoc) => {
    const data = userDoc.data();
    if (data.anonymizedKey && data.publicKey && data.mode) {
      users.push({
        anonymizedKey: data.anonymizedKey,
        mode: data.mode,
        publicKey: data.publicKey,
      });
    }
  });

  return users;
}

async function fetchWalletsForUser(user: UserRecord) {
  try {
    const collectionPath =
      user.mode === 'multisig'
        ? `solo-users/${user.anonymizedKey}/portfolioHistory`
        : `wallet-history/${user.anonymizedKey}/records`;

    const snapshot = await getDocs(collection(db, collectionPath));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedRecords: any[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (!data.encryptedData) continue;

      try {
        let decryptedData;

        if (user.mode === 'multisig') {
          decryptedData = encryptionService.decryptPortfolioHistory(
            data.encryptedData,
            user.publicKey
          );
        } else {
          const decryptedTotalValue = encryptionService.decryptData<number>(
            data.encryptedData.totalValue,
            user.publicKey
          );
          const decryptedWalletCount = encryptionService.decryptData<number>(
            data.encryptedData.walletCount,
            user.publicKey
          );
          const decryptedTokenCount = encryptionService.decryptData<number>(
            data.encryptedData.tokenCount,
            user.publicKey
          );

          decryptedData = {
            timestamp: data.timestamp?.toDate() || new Date(),
            totalValue: decryptedTotalValue,
            walletCount: decryptedWalletCount,
            tokenCount: decryptedTokenCount,
          };
        }

        if (!decryptedData) continue;

        const docRef = doc(db, collectionPath, docSnap.id);
        await setDoc(
          docRef,
          {
            lastFetched: Timestamp.now(),
            processedValue: decryptedData.totalValue,
          },
          { merge: true }
        );

        updatedRecords.push({ id: docSnap.id, ...decryptedData });
      } catch (err) {
        console.error(`failed to decrypt or update record ${docSnap.id}`, err);
      }
    }
  } catch (err) {
    console.error('error fetching wallets for user:', user.anonymizedKey, err);
  }
}

export async function GET() {
  try {
    const users = await fetchAllUsers();

    for (const user of users) {
      await fetchWalletsForUser(user);
    }

    return NextResponse.json({ ok: true, processedUsers: users.length });
  } catch (err) {
    console.error('Error in cron fetch-wallets', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}