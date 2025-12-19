import { useAppSelector } from './../../../hooks'

import DividendList from './components/DividendList';
import DividendCalendar from './components/DividendCalendar';
import UpcomingDividends from './components/UpcomingDividends';

export default function DividendsRoute() {

	return (
		<div data-testid="DividendsRoute">
			<div id="Main" className="flex p-3 overflow-auto">
				<div className="flex grow justify-center align-center">
					<DividendList />
					<div>
						<DividendCalendar />
						<UpcomingDividends />
					</div>
				</div>
			</div>
		</div>
	);
}