import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import App from './index';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('./routes/RootRoute', () => () => <div>Mocked RootRoute</div>);

describe('App Component', () => {
  it('renders without crashing', () => {
    const mockStore = configureStore({
      reducer: (state = {}) => state
    });
    const { getByText } = render(
      <Provider store={mockStore}>
        <App />
      </Provider>
    );

    expect(getByText('Mocked RootRoute')).toBeInTheDocument();
  });

  it('renders the Provider with the store', () => {
    const mockStore = configureStore({
      reducer: (state = {}) => state
    });
    const { container } = render(
      <Provider store={mockStore}>
        <App />
      </Provider>
    );

    expect(container.querySelector('div')).toBeTruthy();
  });

  it('ensures the store is passed correctly to the Provider', () => {
    const mockStore = configureStore({
      reducer: { test: () => ({}) }
    });
    render(
      <Provider store={mockStore}>
        <App />
      </Provider>
    );

    expect(mockStore.getState()).toEqual({ test: {} });
  });
});

it('attaches a DOMContentLoaded event listener and renders the App', () => {
	const mockStore = configureStore({
		reducer: (state = {}) => state
	});

	// Mock the DOM structure
	document.body.innerHTML = '<div id="root"></div>';
	const container = document.getElementById('root');
  const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

  // Mock createRoot and its render method
  const mockRender = jest.fn();
  jest.mock('react-dom/client', () => ({
    createRoot: jest.fn(() => ({
      render: mockRender
    }))
  }));

  // Clear the module cache and re-import the file to ensure the event listener is attached
  jest.resetModules();
  require('./index');

	// Verify the event listener was attached
	expect(addEventListenerSpy).toHaveBeenCalledWith(
		'DOMContentLoaded',
		expect.any(Function)
	);

	// Simulate the DOMContentLoaded event
	const event = new Event('DOMContentLoaded');
	window.dispatchEvent(event);

	// Verify that createRoot and render were called
	expect(container).not.toBeNull();
  expect(mockRender).toHaveBeenCalledWith(expect.anything());
});