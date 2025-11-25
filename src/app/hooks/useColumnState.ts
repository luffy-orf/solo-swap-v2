import { useState, useEffect, useCallback } from 'react';
import { saveColumnSettings, getColumnSettings } from '../lib/firestore/columnSettings';
import { useAuth } from '../contexts/authContext';
import { ColumnConfig } from '../types/table';

const defaultColumns: ColumnConfig[] = [
  { id: 'select', label: '', width: 60, visible: true, sortable: false, resizable: false, field: 'symbol' },
  { id: 'symbol', label: 'symbol', width: 200, visible: true, sortable: true, resizable: true, field: 'symbol' },
  { id: 'balance', label: 'quantity', width: 150, visible: true, sortable: true, resizable: true, field: 'balance' },
  { id: 'price', label: 'price', width: 120, visible: true, sortable: true, resizable: true, field: 'USD' },
  { id: 'value', label: 'value', width: 120, visible: true, sortable: true, resizable: true, field: 'value' },
];

export const useColumnState = () => {
  const { user } = useAuth(); // Get current user from your auth context
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [isLoading, setIsLoading] = useState(true);

  // Load columns from Firestore on mount
  useEffect(() => {
    const loadColumns = async () => {
      if (!user?.uid) {
        // Fallback to localStorage if no user
        const saved = localStorage.getItem('token-table-columns');
        if (saved) {
          setColumns(JSON.parse(saved));
        }
        setIsLoading(false);
        return;
      }

      try {
        const savedColumns = await getColumnSettings(user.uid);
        if (savedColumns) {
          setColumns(savedColumns);
        } else {
          // Fallback to localStorage for first-time users
          const localSaved = localStorage.getItem('token-table-columns');
          if (localSaved) {
            const parsedColumns = JSON.parse(localSaved);
            setColumns(parsedColumns);
            // Save to Firestore for future use
            await saveColumnSettings(user.uid, parsedColumns);
          }
        }
      } catch (error) {
        console.error('Failed to load column settings:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('token-table-columns');
        if (saved) {
          setColumns(JSON.parse(saved));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadColumns();
  }, [user?.uid]);

  // Save to both Firestore and localStorage whenever columns change
  const saveColumns = useCallback(async (newColumns: ColumnConfig[]) => {
    // Save to localStorage immediately
    localStorage.setItem('token-table-columns', JSON.stringify(newColumns));
    
    // Save to Firestore if user is authenticated
    if (user?.uid) {
      try {
        await saveColumnSettings(user.uid, newColumns);
      } catch (error) {
        console.error('Failed to save to Firestore:', error);
        // Continue anyway - localStorage is the fallback
      }
    }
  }, [user?.uid]);

  const updateColumnWidth = useCallback(async (columnId: string, newWidth: number) => {
    setColumns(prev => {
      const newColumns = prev.map(col => 
        col.id === columnId ? { ...col, width: Math.max(80, newWidth) } : col
      );
      saveColumns(newColumns);
      return newColumns;
    });
  }, [saveColumns]);

  const toggleColumnVisibility = useCallback(async (columnId: string) => {
    setColumns(prev => {
      const newColumns = prev.map(col => 
        col.id === columnId ? { ...col, visible: !col.visible } : col
      );
      saveColumns(newColumns);
      return newColumns;
    });
  }, [saveColumns]);

  const reorderColumns = useCallback(async (fromIndex: number, toIndex: number) => {
    setColumns(prev => {
      const newColumns = [...prev];
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      saveColumns(newColumns);
      return newColumns;
    });
  }, [saveColumns]);

  const resetColumns = useCallback(async () => {
    setColumns(defaultColumns);
    saveColumns(defaultColumns);
  }, [saveColumns]);

  return {
    columns,
    isLoading,
    updateColumnWidth,
    toggleColumnVisibility,
    reorderColumns,
    resetColumns,
  };
};