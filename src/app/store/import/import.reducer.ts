import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ParsedTransaction, TradeRepublicParser } from '../../utils/parsers/TradeRepublicParser';

export interface ImportState {
  pendingRecords: ParsedTransaction[];
  isLoading: boolean;
  error: string | null;
}

const initialState: ImportState = {
  pendingRecords: [],
  isLoading: false,
  error: null,
};

export const loadFiles = createAsyncThunk(
  'import/loadFiles',
  async (files: string[]) => {
    const results: ParsedTransaction[] = [];
    let skipped = 0;
    for (const file of files) {
      try {
        const text = await window.API.parsePDF(file);
        const parsed = TradeRepublicParser.parse(text);
        if (parsed) {
          results.push(parsed);
        } else {
          skipped += 1;
        }
      } catch (error) {
        console.error('Error parsing file:', file, error);
        skipped += 1;
      }
    }
    if (!results.length) throw new Error('Keine gültige Trade-Republic-Transaktion erkannt.');
    return { records: results, skipped };
  }
);

const importSlice = createSlice({
  name: 'import',
  initialState,
  reducers: {
    setPendingRecords(state, action: PayloadAction<ParsedTransaction[]>) {
      state.pendingRecords = action.payload;
    },
    removeRecord(state, action: PayloadAction<number>) {
        state.pendingRecords.splice(action.payload, 1);
    },
    clearImport(state) {
      state.pendingRecords = [];
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadFiles.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadFiles.fulfilled, (state, action) => {
        state.isLoading = false;
        state.pendingRecords = [...state.pendingRecords, ...action.payload.records];
        state.error = action.payload.skipped
          ? `${action.payload.skipped} Datei(en) konnten nicht als Transaktion erkannt werden.`
          : null;
      })
      .addCase(loadFiles.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load files';
      });
  }
});

export const { setPendingRecords, removeRecord, clearImport } = importSlice.actions;
export default importSlice.reducer;
