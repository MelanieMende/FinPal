import { useEffect, useState } from 'react';
import { Button, Icon, Menu, MenuItem, Popover, Position, Tab, Tabs } from '@blueprintjs/core';
import { useAppSelector, useAppDispatch } from '../../../hooks';
import { changeSelectedTab } from '../../../store/appState/appState.reducer';
import Settings from './components/Settings';
import './TopNavBar.css';

const sections = [
  { id: 'dashboardTab', label: 'Dashboard', icon: 'dashboard' },
  { id: 'analysisTab', label: 'Analyse', icon: 'search' },
  { id: 'assetsTab', label: 'Bestand', icon: 'timeline-line-chart' },
  { id: 'transactionsTab', label: 'Transaktionen', icon: 'list' },
  { id: 'dividendsTab', label: 'Dividenden', icon: 'calendar' },
  { id: 'cashTab', label: 'Cash', icon: 'dollar' },
] as const;

export default function TopNavBar() {
  const theme = useAppSelector(state => state.appState.theme);
  const route = useAppSelector(state => state.appState.selectedTab);
  const dispatch = useAppDispatch();
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const visible = width < 850 ? [] : width < 1100 ? sections.slice(0, 3) : sections;
  const overflow = sections.slice(visible.length);
  const activeOverflow = overflow.find(section => section.id === route);
  const select = (id: string | number) => {
    if (id !== route) dispatch(changeSelectedTab(id));
  };
  return (
    <nav id="TopNavBar" data-testid="TopNavBar" aria-label="Hauptnavigation" className={`finpal-nav ${theme}`}>
      <span className="finpal-wordmark bg-linear-to-l from-indigo-500 from-10% via-sky-500 via-30% to-emerald-500 to-90%" role="img" aria-label="FinPal" />
      <div className="finpal-nav-sections">
        {visible.length > 0 && <Tabs id="TopNavTabs" selectedTabId={route} onChange={select} animate={false}>
          {visible.map(section => <Tab key={section.id} id={section.id} data-testid={section.id}
            title={<><Icon icon={section.icon} aria-hidden="true" />{section.label}</>} />)}
        </Tabs>}
        {overflow.length > 0 && <Popover position={Position.BOTTOM_LEFT} content={
          <Menu aria-label="Weitere Bereiche">
            {overflow.map(section => <MenuItem key={section.id} text={section.label} icon={section.icon} active={section.id === route}
              aria-current={section.id === route ? 'page' : undefined} onClick={() => select(section.id)} />)}
          </Menu>
        }>
          <Button className={`finpal-nav-more ${activeOverflow ? 'is-active' : ''}`} minimal rightIcon="chevron-down"
            icon={visible.length === 0 ? activeOverflow?.icon : undefined}
            aria-label={visible.length === 0 ? `Bereich wählen: ${activeOverflow?.label ?? 'Navigation'}` : `Mehr${activeOverflow ? `: ${activeOverflow.label}` : ''}`}
            text={visible.length === 0 ? activeOverflow?.label ?? 'Navigation' : activeOverflow ? `Mehr · ${activeOverflow.label}` : 'Mehr'} />
        </Popover>}
      </div>
      <div className="finpal-nav-actions">
        <Button data-testid="importTab" className="finpal-nav-import" icon="import" text="Import" minimal
          active={route === 'importTab'} aria-current={route === 'importTab' ? 'page' : undefined} onClick={() => select('importTab')} />
        <Popover content={<Settings />} position={Position.BOTTOM_RIGHT}>
          <Button data-testid="TopNavBarSettings" aria-label="Einstellungen" minimal icon="settings" />
        </Popover>
      </div>
    </nav>
  );
}
