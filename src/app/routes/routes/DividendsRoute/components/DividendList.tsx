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
		<div className="w-full">
      <Table className="w-full">
        <thead>
					<tr className="bg-white/5">
						{columns.map((col, idx) => (
							<th key={idx} className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10">
								{col.header.content}
							</th>
						))}
					</tr>
				</thead>
        <tbody>
          <DividendCreation/>
          {dividends.filter((dividend) => {
            if(filerForAssets.length > 0) {
              return filerForAssets.includes(dividend.asset_ID);
            }
            return true;
          }).map((dividend, i) => {
            return (<DividendListItem key={"dividend-" + dividend.ID} i={i+1} dividend={dividend} />)
          })}
        </tbody>
      </Table>
    </div>
	);
}