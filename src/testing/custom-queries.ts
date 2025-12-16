import {
  queryHelpers,
  buildQueries,
  Matcher,
  MatcherOptions,
} from '@testing-library/react'

// The queryAllByAttribute is a shortcut for attribute-based matchers
// You can also use document.querySelector or a combination of existing
// testing library utilities to find matching nodes for your query
const queryAllById = (
  container: HTMLElement,
  id: Matcher,
  options?: MatcherOptions | undefined,
) => queryHelpers.queryAllByAttribute('id', container, id, options)

const getMultipleError = (c:any, IdValue:any) =>
  `Found multiple elements with the id: ${IdValue}`
const getMissingError = (c:any, IdValue:any) =>
  `Unable to find an element with the id: ${IdValue}`

const [
  queryById,
  getAllById,
  getById,
  findAllById,
  findById,
] = buildQueries(queryAllById, getMultipleError, getMissingError)

export {
  queryById,
  queryAllById,
  getById,
  getAllById,
  findAllById,
  findById,
}