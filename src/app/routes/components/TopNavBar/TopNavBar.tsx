import { useAppSelector, useAppDispatch } from '../../../hooks'

import * as appStateReducer from "../../../store/appState/appState.reducer";

import './TopNavBar.css';

import Settings from './components/Settings';

import {
  Alignment,
  Button,
	Icon,
  Navbar,
  NavbarGroup,
  NavbarDivider,
	Position,
	Popover,
  Tab,
  Tabs,
  Tooltip,
} from '@blueprintjs/core';

export default function TopNavBar () {

	const theme = useAppSelector(state => state.appState.theme)
	const route = useAppSelector(state => state.appState.selectedTab)
	const dispatch = useAppDispatch();

	return (
		
		<Navbar 
			id="TopNavBar"
			data-testid="TopNavBar"
			className={'sticky top-0 px-2 py-0 ' + theme + ' shadow[0_5px_5px_0_rgba(0, 0, 0, 0.13)]'}>
			<NavbarGroup id="TopNavBarGroupLeft" align={Alignment.LEFT}>
				{/* SETTINGS DROPDOWN */}
				<Popover content={<Settings />} position={Position.BOTTOM_RIGHT}>
					<Button data-testid="TopNavBarSettings" minimal={true} icon="settings" />
				</Popover>

				<NavbarDivider />

				{/* SECTION TABS */}
				<Tabs
					id="TopNavTabs"
					onChange={ (navbarTabId) => handleTabChange(navbarTabId) }
					selectedTabId={route}
					animate={true}
					fill={true}>
						
						<Tab id="assetsTab" data-testid="assetsTab" className="mr-0" >
							<Icon icon="timeline-line-chart" className="mr-2 ml-2" /> Assets
						</Tab>

						<NavbarDivider className="ml-0 mb-[15px]" />

						<Tab id="transactionsTab" data-testid="transactionsTab" className="mr-0" >
							<Icon icon="list" className="mr-2 ml-2" /> Transactions
						</Tab>

						<NavbarDivider className="ml-0 mb-[15px]" />

						<Tab id="dividendsTab" data-testid="dividendsTab">
							<Icon icon="calendar" className="mr-2" /> Dividends
						</Tab>

						<NavbarDivider className="ml-0 mb-[15px]" />

						<Tab id="cashTab" data-testid="cashTab">
							<Icon icon="dollar" className="mr-2" /> Cash
						</Tab>
						
				</Tabs>
      </NavbarGroup>

			<NavbarGroup id="TopNavBarGroupRight" align={Alignment.RIGHT}>

				<NavbarDivider className="margin-0" />

				<Tooltip content="Quit FinPal" position={Position.BOTTOM}>
					<Button
						data-testid={"quit-button"} 
						minimal={true}
						icon="small-cross"
						onClick={() => window.API.quit()}
					/>
				</Tooltip>
      </NavbarGroup>
    </Navbar>
  );

	function handleTabChange(navbarTabId:any) {
		console.log("Tab '" + navbarTabId + "' got clicked.")
		if( navbarTabId != route) {
			dispatch(appStateReducer.changeSelectedTab(navbarTabId));
		}
		else {
			console.log("Current route is already \\" + route)
		}
	}
}