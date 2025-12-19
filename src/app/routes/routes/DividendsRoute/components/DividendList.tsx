import { useAppSelector, useAppDispatch } from './../../../../hooks'

import AssetFilter from './../../../../components/AssetFilter/AssetFilter'
import DividendCreation from './DividendCreation';
import DividendListItem from './DividendListItem';
import Table from '../../../../components/Table/Table';
import TableHeaderRow from '../../../../components/Table/TableHeaderRow/TableHeaderRow';
import * as appStateReducer from '../../../../store/appState/appState.reducer';

export default function DividendList() {

	const dividends = useAppSelector(state => state.dividends)
	const filerForAssets = useAppSelector(state => state.appState.dividends_AssetFilter)

  const columns = [
		{
			header: {
				content: '#'
			}
		},
    {
			header: {
				content: 'Date'
			}
		},
    {
			header: {
				content: <div>{'Asset '}<AssetFilter filter={filerForAssets} onChange={appStateReducer.dividends_AssetFilter_ToggleAsset} /></div>
			}
		},
    {
			header: {
				content: 'Income'
			}
		},
  ]

	return (
		<div data-testid="DividendList">
      <Table>
        <TableHeaderRow columns={columns}/>
        <tbody>
          <DividendCreation/>
          {dividends.filter((dividend) => {
            if(filerForAssets.length > 0) {
              if(filerForAssets.includes(dividend.asset_ID)) {
                return dividend
              }
            }
            else {
              return dividend
            }
          }).map((dividend, i) => {
            return (<DividendListItem key={"dividend-" + dividend.ID} i={i+1} dividend={dividend} />)
          })}
        </tbody>
      </Table>
    </div>
	);
}