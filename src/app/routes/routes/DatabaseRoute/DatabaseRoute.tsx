import { Button, Intent } from '@blueprintjs/core'
import { useAppSelector, useAppDispatch } from './../../../hooks'
import * as appStateReducer from '../../../store/appState/appState.reducer';

export default function AnalysisRoute() {

  const dispatch = useAppDispatch();
  const db = useAppSelector(state => state.appState.database)

  return (
		<div id="DatabaseRoute">
        <div>Database</div>
        <div>{db}</div>
        <Button id="selectDatabaseButton" intent={Intent.PRIMARY} text="Select an existing database" fill onClick={() => selectDatabase()} />
        <div>or <Button id="createNewDatabaseButton" intent={Intent.PRIMARY} icon="plus" text="Create a new database" fill onClick={() => createNewDatabase()} /></div>
    </div>
  )

  function selectDatabase() {
    window.API.selectFolder().then((result: any)=>{
      console.log(result)
      window.API.saveDatabase(result)
      dispatch(appStateReducer.setDatabase(result))
    })
  }

  function createNewDatabase() {
    console.log('createNewDatabaseButton clicked')
  }
}