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
  async (files: string[], thunkAPI) => {
    const results: ParsedTransaction[] = [];
    for (const file of files) {
      try {
        const text = await window.API.parsePDF(file);
        const parsed = TradeRepublicParser.parse(text);
        if (parsed) {
          results.push(parsed);
        }
      } catch (error) {
        console.error('Error parsing file:', file, error);
      }
    }
    return results;
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
        state.pendingRecords = [...state.pendingRecords, ...action.payload];
      })
      .addCase(loadFiles.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load files';
      });
  }
});

export const { setPendingRecords, removeRecord, clearImport } = importSlice.actions;
export default importSlice.reducer;
