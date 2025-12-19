import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as assetsReducer from './assets.reducer'
import { setupStore } from '..';

describe('AssetCreation reducer', () => {

  it('should return the initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(assetsReducer.initialState)
  })

  describe('Assets Actions', () => {

    it('should handle setAssets action', () => {
      const initialState = assetsReducer.initialState;
      const assets = [{
        ID: 1,
        name: '3M',
        symbol: 'MMM'
      }] as Asset[];
      const newState = reducer(initialState, assetsReducer.setAssets(assets));
      expect(newState).toEqual(assets);
    });
/*
    it('should handle clearAssets action', () => {
      const initialState = {
        ...assetsReducer.initialState,
        assets: [{
          ID: 1,
          name: '3M',
          symbol: 'MMM'
        }]
      };
      const newState = reducer(initialState, assetsReducer.clearAssets());
      expect(newState).toEqual([]);
    });
*/
  });

  describe('Assets Thunks', () => {
/*
    it('should handle fetchAssets thunk', async () => {
      const store = setupStore();
      const mockAssets = [{
        ID: 1,
        name: '3M',
        symbol: 'MMM'
      }] as Asset[];
      jest.spyOn(assetsReducer, 'fetchAssets').mockResolvedValueOnce(mockAssets);
      await store.dispatch(assetsReducer.fetchAssets() as any);
      expect(store.getState().assets.assets).toEqual(mockAssets);
    });
*/
  });

});