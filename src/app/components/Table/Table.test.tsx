import React from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import Table from "./Table";

const mockStore = configureStore([]);

describe("Table Component", () => {
  it("renders children correctly", () => {
    const store = mockStore({
      appState: { theme: "light-theme" },
    });

    const { getByText } = render(
      <Provider store={store}>
        <Table>
          <tbody>
            <tr>
              <td>Test Content</td>
            </tr>
          </tbody>
        </Table>
      </Provider>
    );

    expect(getByText("Test Content")).toBeInTheDocument();
  });

  it("applies the correct theme class", () => {
    const store = mockStore({
      appState: { theme: "dark-theme" },
    });

    const { container } = render(
      <Provider store={store}>
        <Table>
          <tbody>
            <tr>
              <td>Test Content</td>
            </tr>
          </tbody>
        </Table>
      </Provider>
    );

    expect(container.querySelector("table")).toHaveClass("dark-theme");
  });
});