import { act, screen, waitFor } from '@testing-library/react'
import reducer, * as assetsReducer from './assets.reducer'
import { setupStore } from '..';

describe('AssetCreation reducer', () => {

  it('should return the initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(assetsReducer.initialState)
  })

  describe('Assets Thunks', () => {

    it('should dispatch loadAssets thunk', async () => {
      const dispatch = jest.fn();
      const getState = jest.fn();
      const mockAssets = [
        { ID: 1, name: '3M', symbol: 'MMM' },
        { ID: 2, name: 'Apple', symbol: 'AAPL' },
      ] as Asset[];
      window.API = {
        sendToDB: jest.fn() as jest.MockedFunction<(sql: string) => any>,
      };
      (window.API.sendToDB as jest.Mock).mockResolvedValue(mockAssets);
      
      await assetsReducer.loadAssets()(dispatch, getState, undefined);
      expect(dispatch).toHaveBeenCalledWith(assetsReducer.setAssets(mockAssets));
      
      // Reset the mock to avoid conflicts in subsequent tests
      (window.API.sendToDB as jest.Mock).mockResolvedValue([]);
    });

    it('should dispatch loadAsset thunk', async () => {
      const dispatch = jest.fn();
      const getState = jest.fn();
      const mockAsset = { ID: 1, name: '3M', symbol: 'MMM' } as Asset;
      window.API = {
        sendToDB: jest.fn() as jest.MockedFunction<(sql: string) => any>,
      };
      // return an array to match thunk code
      (window.API.sendToDB as jest.Mock).mockResolvedValue([mockAsset]);
      
      await assetsReducer.loadAsset({assetID: 1})(dispatch, getState, undefined);
      expect(dispatch).toHaveBeenCalledWith(assetsReducer.setAsset(mockAsset));
      
      // Reset the mock to avoid conflicts in subsequent tests
      (window.API.sendToDB as jest.Mock).mockResolvedValue([]);
    });

  });

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

  });

});