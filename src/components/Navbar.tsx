import { useState, useRef, useEffect } from 'react';
import type { PanelConfig } from '../data/panelRegistry';
import styles from './Navbar.module.css';

interface NavbarProps {
  machineName: string;
  panels: PanelConfig[];
  activePanelId: string;
  onPanelSelect: (panelId: string) => void;
  onRunClick: () => void;
}

export default function Navbar({ machineName, panels, activePanelId, onPanelSelect, onRunClick }: NavbarProps) {
  const [search, setSearch]   = useState('');
  const [open, setOpen]       = useState(false);
  const wrapRef               = useRef<HTMLDivElement>(null);

  const filtered = panels.filter((p) =>
    p.panelId.toLowerCase().includes(search.toLowerCase()) ||
    p.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (panelId: string) => {
    onPanelSelect(panelId);
    setSearch('');
    setOpen(false);
  };

  return (
    <nav className={styles.navbar}>
      <button
        className={styles.runBtn}
        onClick={onRunClick}
        title="Machine running — click to view current panel"
      >
        <span className={styles.runDot} />
        RUN
      </button>

      <span className={styles.machineName}>{machineName}</span>

      <div className={styles.searchWrap} ref={wrapRef}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search panel..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && filtered.length > 0 && (
          <ul className={styles.dropdown}>
            {filtered.map((p) => (
              <li
                key={p.panelId}
                className={`${styles.dropdownItem} ${p.panelId === activePanelId ? styles.activeItem : ''}`}
                onMouseDown={() => handleSelect(p.panelId)}
              >
                <span>{p.displayName}</span>
                <span className={`${styles.tag} ${p.isLegacy ? styles.tagLegacy : styles.tagLive}`}>
                  {p.isLegacy ? 'Legacy' : 'Live'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
