/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  Table as TableIcon, 
  Settings, 
  FileSpreadsheet, 
  ChevronRight, 
  Download,
  Plus,
  RefreshCw,
  LayoutDashboard,
  Calendar,
  Layers,
  BarChart,
  PieChart as PieIcon,
  TrendingUp,
  Box,
  Truck,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths, addDays, startOfMonth, endOfMonth, parseISO, startOfISOWeek, endOfISOWeek } from 'date-fns';
import * as XLSX from 'xlsx';
import { 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { cn } from './lib/utils';
import { ForecastInputTable } from './components/forecast/ForecastInputTable';
import { getForecastCellValue } from './components/forecast/forecastCellUtils';
import { filterRegistrations, hasActiveColumnFilters } from './components/forecast/forecastFilterUtils';
import { MOCK_REGISTRATIONS } from './data/mockRegistrations';
import type {
  ColumnFiltersState,
  CPLPrice,
  Dimension,
  ForecastValue,
  Registration,
  ValueType,
} from './types/forecast';

// --- Types ---

type AppTab = 'forecast' | 'master' | 'dashboard' | 'weekly' | 'monthly' | 'yearly' | 'mtp' | 'pdc' | 'inventory' | 'suggestion';

// --- Mock Data ---

const MOCK_CPL_PRICES: CPLPrice[] = [
  { month: '2026-05', price: 1200 },
  { month: '2026-06', price: 1200 },
  { month: '2026-07', price: 1300 },
  { month: '2026-08', price: 1300 },
  { month: '2026-09', price: 1300 },
  { month: '2026-10', price: 1400 },
  { month: '2026-11', price: 1400 },
  { month: '2026-12', price: 1400 },
  { month: '2027-01', price: 1500 },
];

const INITIAL_FORECAST: ForecastValue[] = MOCK_REGISTRATIONS.flatMap(reg => 
  MOCK_CPL_PRICES.map(cpl => ({
    registrationId: reg.id,
    month: cpl.month,
    version: 'Current Forecast',
    qtyAct: Math.floor(Math.random() * 500),
    qtyFcst: 0,
    priceAct: 1500,
  }))
);

// --- Components ---

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('forecast');
  const [isAddingVersion, setIsAddingVersion] = useState(false);
  const [isEditingVersion, setIsEditingVersion] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [editingVersionName, setEditingVersionName] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isAddingCpl, setIsAddingCpl] = useState(false);
  const [selectedFy, setSelectedFy] = useState(2026);
  const cplTableRef = useRef<HTMLDivElement>(null);
  const [registrations, setRegistrations] = useState<Registration[]>(MOCK_REGISTRATIONS);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>({});
  const [forecastData, setForecastData] = useState<ForecastValue[]>(INITIAL_FORECAST);
  const [cplPrices, setCplPrices] = useState<CPLPrice[]>(MOCK_CPL_PRICES);
  const [versions, setVersions] = useState(['Current Forecast', 'BB FY26', 'SepF FY26']);
  const [selectedVersion, setSelectedVersion] = useState('Current Forecast');
  const [stampPeriod, setStampPeriod] = useState('No');
  const [planningView, setPlanningView] = useState<'sale' | 'accounting' | 'production'>('sale');
  const [selectedDimension, setSelectedDimension] = useState<Dimension>('Qty');
  const [selectedType, setSelectedType] = useState<ValueType>('Fcst');
  const [forecastMode, setForecastMode] = useState<'month' | 'week' | 'day'>('month');
  const [dateRange, setDateRange] = useState({ 
    start: format(new Date(), 'yyyy-MM'), 
    end: format(addMonths(new Date(), 3), 'yyyy-MM') 
  });
  const startVisibleRef = useRef<HTMLInputElement | null>(null);
  const endVisibleRef = useRef<HTMLInputElement | null>(null);
  const startDatePickerRef = useRef<HTMLInputElement | null>(null);
  const endDatePickerRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };

  const formatDayModeValue = (value: string) => {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  };

  const parseDayModeValue = (value: string) => {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const dayNum = Number(day);
    const monthNum = Number(month);
    const date = new Date(`${year}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`);
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() + 1 !== monthNum ||
      date.getDate() !== dayNum
    ) {
      return null;
    }
    return `${year}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
  };

  const convertMonthRangeToDateRange = (range: { start: string; end: string }) => {
    const startDate = parseISO(`${range.start}-01`);
    const endDate = endOfMonth(parseISO(`${range.end}-01`));
    return {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd'),
    };
  };

  const convertDateRangeToMonthRange = (range: { start: string; end: string }) => ({
    start: format(parseISO(range.start), 'yyyy-MM'),
    end: format(parseISO(range.end), 'yyyy-MM'),
  });

  const handleForecastModeChange = (mode: 'month' | 'week' | 'day') => {
    if (mode === forecastMode) return;
    setForecastMode(mode);
    // Only convert if switching TO/FROM month mode
    // Month uses 'yyyy-MM' format, Week/Day use 'yyyy-MM-dd' format
    if (mode === 'month' && forecastMode !== 'month') {
      // Converting TO month mode from any non-month mode
      setDateRange(prev => convertDateRangeToMonthRange(prev));
    } else if (mode !== 'month' && forecastMode === 'month') {
      // Converting FROM month mode to any non-month mode
      setDateRange(prev => convertMonthRangeToDateRange(prev));
    }
    // If both are non-month modes (week/day to day/week), keep dateRange as-is
  };

  const filteredRegistrations = useMemo(
    () => filterRegistrations(registrations, columnFilters),
    [columnFilters, registrations]
  );

  const monthsToShow = useMemo(() => {
    const list: string[] = [];
    if (forecastMode === 'month') {
      const startDate = parseISO(dateRange.start + '-01');
      const endDate = parseISO(dateRange.end + '-01');
      let curr = startOfMonth(startDate);
      const end = startOfMonth(endDate);
      while (curr <= end) {
        list.push(format(curr, 'yyyy-MM'));
        curr = addMonths(curr, 1);
      }
    } else if (forecastMode === 'week') {
      let curr = parseISO(dateRange.start);
      const end = parseISO(dateRange.end);
      while (curr <= end) {
        const weekEnd = end < addDays(curr, 6) ? end : addDays(curr, 6);
        list.push(`${format(curr, 'yyyy-MM-dd')}|${format(weekEnd, 'yyyy-MM-dd')}`);
        curr = addDays(weekEnd, 1);
      }
    } else if (forecastMode === 'day') {
      let curr = parseISO(dateRange.start);
      const end = parseISO(dateRange.end);
      while (curr <= end) {
        list.push(format(curr, 'yyyy-MM-dd'));
        curr = addDays(curr, 1);
      }
    }
    return list;
  }, [dateRange, forecastMode]);

  const filteredCplPrices = useMemo(() => {
    const fyStart = `${selectedFy}-04`;
    const fyEnd = `${selectedFy + 1}-03`;
    return cplPrices.filter(c => c.month >= fyStart && c.month <= fyEnd)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [cplPrices, selectedFy]);

  const handleForecastChange = (regId: string, month: string, value: number) => {
    setForecastData(prev => {
      const index = prev.findIndex(item => 
        item.registrationId === regId && 
        item.month === month && 
        item.version === selectedVersion
      );

      if (index > -1) {
        const newData = [...prev];
        newData[index] = { ...newData[index], qtyFcst: value };
        return newData;
      } else {
        return [...prev, {
          registrationId: regId,
          month,
          version: selectedVersion,
          qtyAct: 200,
          qtyFcst: value,
          priceAct: 1500
        }];
      }
    });
  };

  const exportToExcel = () => {
    const data = registrations.map(reg => {
      const row: any = { ...reg };
      monthsToShow.forEach(m => {
        const { value } = getForecastCellValue(
          reg,
          m,
          selectedVersion,
          selectedDimension,
          selectedType,
          forecastData,
          cplPrices,
          forecastMode
        );
        row[m] = value;
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Forecast");
    XLSX.writeFile(workbook, `SaleForecast_${selectedVersion}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden">
      {/* Top Branding Bar */}
      <nav className="h-12 bg-slate-900 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-white text-[10px] font-black">SN</div>
            <span className="text-white font-bold tracking-tight text-base uppercase">Sales<span className="text-blue-400">Nexus</span> <span className="text-[10px] opacity-50 ml-1">v2.0</span></span>
          </div>
          <div className="h-4 w-[1px] bg-slate-700"></div>
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('forecast')}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-all pb-1",
                activeTab === 'forecast' ? "text-blue-300 border-b border-blue-400" : "text-slate-400 hover:text-white"
              )}
            >
              Sales Forecast
            </button>
            <button 
              onClick={() => setActiveTab('master')}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-all pb-1",
                activeTab === 'master' ? "text-blue-300 border-b border-blue-400" : "text-slate-400 hover:text-white"
              )}
            >
              CPL Management
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-all pb-1",
                activeTab === 'dashboard' ? "text-blue-300 border-b border-blue-400" : "text-slate-400 hover:text-white"
              )}
            >
              Analytics
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-2">
            <p className="text-[8px] text-slate-500 leading-none uppercase font-bold">Authenticated as</p>
            <p className="text-[10px] text-white font-semibold">User (Admin)</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shadow-inner">CW</div>
        </div>
      </nav>

      {/* Filter Area (Header) */}
      {activeTab === 'forecast' && (
        <header className="h-[115px] bg-white border-b border-slate-200 pt-5 pb-3 px-4 flex flex-col justify-center shrink-0 shadow-sm z-40">
          <div className="grid grid-cols-7 gap-6 max-w-[1400px] items-center">
            <div className="col-span-2">
              <FilterGroup
                label="Date Range"
                action={
                  <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 p-1 text-[10px] font-bold uppercase">
                    {(['month', 'week'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleForecastModeChange(mode)}
                        className={cn(
                          "rounded-full px-2 py-1 transition-all",
                          forecastMode === mode
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {mode === 'month' ? 'Month' : 'Week'}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input 
                    ref={startVisibleRef}
                    type={forecastMode === 'month' ? 'month' : 'text'}
                    value={forecastMode === 'month' ? dateRange.start : formatDayModeValue(dateRange.start)} 
                    onChange={e => {
                      if (forecastMode === 'month') {
                        setDateRange(prev => ({ ...prev, start: e.target.value }));
                      } else if (forecastMode === 'week' || forecastMode === 'day') {
                        const parsed = parseDayModeValue(e.target.value);
                        if (parsed !== null) {
                          setDateRange(prev => ({ ...prev, start: parsed }));
                        }
                      }
                    }}
                    className="w-full pr-12 text-xs border border-slate-200 rounded p-1.5 bg-slate-50 focus:border-blue-400 outline-none transition-all appearance-none calendar-month-input" 
                  />
                  <input
                    ref={startDatePickerRef}
                    type="date"
                    value={forecastMode !== 'month' ? dateRange.start : ''}
                    onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => openDatePicker(forecastMode === 'month' ? startVisibleRef.current : startDatePickerRef.current)}
                    className="absolute inset-y-0 right-1.5 flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors"
                    aria-label="Open start month picker"
                  >
                    <Calendar size={14} />
                  </button>
                </div>
                <span className="text-slate-300 text-[10px]">TO</span>
                <div className="relative flex-1">
                  <input 
                    ref={endVisibleRef}
                    type={forecastMode === 'month' ? 'month' : 'text'}
                    value={forecastMode === 'month' ? dateRange.end : formatDayModeValue(dateRange.end)} 
                    onChange={e => {
                      if (forecastMode === 'month') {
                        setDateRange(prev => ({ ...prev, end: e.target.value }));
                      } else if (forecastMode === 'week' || forecastMode === 'day') {
                        const parsed = parseDayModeValue(e.target.value);
                        if (parsed !== null) {
                          setDateRange(prev => ({ ...prev, end: parsed }));
                        }
                      }
                    }}
                    className="w-full pr-12 text-xs border border-slate-200 rounded p-1.5 bg-slate-50 focus:border-blue-400 outline-none transition-all appearance-none calendar-month-input" 
                  />
                  <input
                    ref={endDatePickerRef}
                    type="date"
                    value={forecastMode !== 'month' ? dateRange.end : ''}
                    onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => openDatePicker(forecastMode === 'month' ? endVisibleRef.current : endDatePickerRef.current)}
                    className="absolute inset-y-0 right-1.5 flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors"
                    aria-label="Open end month picker"
                  >
                    <Calendar size={14} />
                  </button>
                </div>
                </div>
              </FilterGroup>
            </div>

            <FilterGroup label="Dimension">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['Qty', 'Price', 'Amount'] as Dimension[]).map(d => (
                  <button 
                    key={d}
                    onClick={() => setSelectedDimension(d)}
                    className={cn(
                      "flex-1 text-[10px] py-1 rounded transition-all font-bold uppercase",
                      selectedDimension === d ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Value Type">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['Act', 'Fcst', 'Act-Fcst'] as ValueType[]).map(t => (
                  <button 
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={cn(
                      "flex-1 text-[10px] py-1 rounded transition-all font-bold uppercase",
                      selectedType === t ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </FilterGroup>

                <FilterGroup label="Forecast Version">
                  <div className="flex flex-wrap items-center gap-2 relative">
                    <div className="relative flex-1 min-w-0">
                      <select 
                        value={selectedVersion} 
                        onChange={e => setSelectedVersion(e.target.value)}
                        className="w-full text-xs border border-blue-200 rounded p-1.5 bg-blue-50 text-blue-700 font-bold outline-none appearance-none pr-8 transition-all focus:ring-2 focus:ring-blue-100"
                      >
                        {versions.map(v => <option key={v}>{v}</option>)}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                        <ChevronRight size={14} className="rotate-90" />
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsAddingVersion(true)}
                      className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg border border-blue-100 transition-colors bg-white shadow-sm"
                      title="Add New Version"
                    >
                      <Plus size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingVersionName(selectedVersion);
                        setIsEditingVersion(true);
                      }}
                      className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg border border-amber-100 transition-colors bg-white shadow-sm"
                      title="Edit Selected Version"
                    >
                      <Settings size={16} />
                    </button>

                    <AnimatePresence>
                      {isAddingVersion && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-[100]"
                        >
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Add New Forecast Version</h4>
                          <input 
                            autoFocus
                            type="text" 
                            value={newVersionName}
                            onChange={e => setNewVersionName(e.target.value)}
                            placeholder="e.g. DecF FY26"
                            className="w-full text-xs border border-slate-200 rounded p-2 focus:border-blue-500 outline-none mb-3"
                          />
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                if (newVersionName && !versions.includes(newVersionName)) {
                                  setVersions(prev => [...prev, newVersionName]);
                                  setSelectedVersion(newVersionName);
                                  setNewVersionName('');
                                  setIsAddingVersion(false);
                                }
                              }}
                              className="flex-1 bg-blue-600 text-white text-[10px] font-bold py-2 rounded-lg"
                            >
                              Add Version
                            </button>
                            <button 
                              onClick={() => setIsAddingVersion(false)}
                              className="flex-1 bg-slate-100 text-slate-600 text-[10px] font-bold py-2 rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {isEditingVersion && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-[100]"
                        >
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-3">Rename Forecast Version</h4>
                          <p className="text-[9px] text-slate-400 mb-2 font-medium italic">Renaming "{selectedVersion}"</p>
                          <input 
                            autoFocus
                            type="text" 
                            value={editingVersionName}
                            onChange={e => setEditingVersionName(e.target.value)}
                            placeholder="New name..."
                            className="w-full text-xs border border-slate-200 rounded p-2 focus:border-amber-400 outline-none mb-3"
                          />
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                if (editingVersionName && editingVersionName !== selectedVersion && !versions.includes(editingVersionName)) {
                                  const oldName = selectedVersion;
                                  const newName = editingVersionName;
                                  
                                  // Update versions list
                                  setVersions(prev => prev.map(v => v === oldName ? newName : v));
                                  
                                  // Update forecast data
                                  setForecastData(prev => prev.map(f => f.version === oldName ? { ...f, version: newName } : f));
                                  
                                  // Update selected version
                                  setSelectedVersion(newName);
                                  
                                  setIsEditingVersion(false);
                                } else if (editingVersionName === selectedVersion) {
                                  setIsEditingVersion(false);
                                }
                              }}
                              className="flex-1 bg-amber-500 text-white text-[10px] font-bold py-2 rounded-lg"
                            >
                              Update
                            </button>
                            <button 
                              onClick={() => setIsEditingVersion(false)}
                              className="flex-1 bg-slate-100 text-slate-600 text-[10px] font-bold py-2 rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                          {versions.includes(editingVersionName) && editingVersionName !== selectedVersion && (
                            <p className="text-[8px] text-red-500 mt-2 font-bold uppercase tracking-tighter">Name already exists!</p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </FilterGroup>

                <FilterGroup label="STAMP PERIOD">
                  <div className="relative">
                    <select
                      value={stampPeriod}
                      onChange={e => setStampPeriod(e.target.value)}
                      className="w-full text-xs border border-blue-200 rounded p-1.5 bg-blue-50 text-blue-700 font-bold outline-none appearance-none pr-8 transition-all focus:ring-2 focus:ring-blue-100"
                    >
                      {['No', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Month 1', 'Month 2'].map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                </FilterGroup>

                <FilterGroup label="VIEW MODE">
                  <div className="relative">
                    <select
                      value={planningView}
                      onChange={e => setPlanningView(e.target.value as 'sale' | 'accounting' | 'production')}
                      className="w-full text-xs border border-blue-200 rounded p-1.5 bg-blue-50 text-blue-700 font-bold outline-none appearance-none pr-8 transition-all focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="sale">Sale Input</option>
                      <option value="accounting">Accounting</option>
                      <option value="production">Production</option>
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                </FilterGroup>

            <div className="flex items-center justify-end gap-2 text-blue-600">
              {hasActiveColumnFilters(columnFilters) && (
                <button 
                  onClick={() => setColumnFilters({})}
                  className="text-[10px] font-bold uppercase underline hover:text-blue-800 transition-colors px-2"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {activeTab === 'master' && (
        <header className="h-[115px] bg-white border-b border-slate-200 p-4 flex flex-col justify-center shrink-0 shadow-sm z-40">
          <div className="flex items-end justify-between max-w-[1400px] w-full">
            <div className="flex gap-4">
              <FilterGroup label="Fiscal Year (FY)">
                <div className="relative">
                  <select 
                    value={selectedFy} 
                    onChange={e => setSelectedFy(Number(e.target.value))}
                    className="w-64 text-xs border border-blue-200 rounded p-1.5 bg-blue-50 text-blue-700 font-bold outline-none appearance-none pr-8 transition-all focus:ring-2 focus:ring-blue-100 shadow-sm"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>FY {String(y).slice(-2)} ({y}-04 ถึง {y+1}-03)</option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                    <ChevronRight size={14} className="rotate-90" />
                  </div>
                </div>
              </FilterGroup>
              
              <div className="flex flex-col justify-end pb-[2px]">
                <h2 className="text-sm font-bold text-slate-700 tracking-tight">CPL Base Price Management</h2>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Global Master Data Management</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setIsAddingCpl(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-2 px-4 rounded-lg shadow-sm flex items-center gap-1 uppercase tracking-wider transition-all active:scale-95"
              >
                <Plus size={12} />
                Add Month to FY{String(selectedFy).slice(-2)}
              </button>
              <button 
                onClick={() => {
                  const worksheet = XLSX.utils.json_to_sheet(filteredCplPrices);
                  const workbook = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(workbook, worksheet, `CPL_FY${String(selectedFy).slice(-2)}`);
                  XLSX.writeFile(workbook, `CPL_FY${String(selectedFy).slice(-2)}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold py-2 px-4 rounded-lg shadow-sm flex items-center gap-1 uppercase tracking-wider transition-all active:scale-95"
              >
                <Download size={12} />
                Export FY
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 z-30">
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Main Outputs</h3>
            <div className="space-y-1">
              <SideNavItem 
                active={activeTab === 'forecast'} 
                label="Sales Forecast Input" 
                onClick={() => setActiveTab('forecast')} 
                icon={<FileSpreadsheet size={14} />}
              />
              <SideNavItem 
                active={activeTab === 'weekly'}
                label="Weekly Sale Report" 
                onClick={() => setActiveTab('weekly')} 
                icon={<BarChart size={14} />}
              />
              <SideNavItem 
                active={activeTab === 'monthly'}
                label="Monthly Sale Report" 
                onClick={() => setActiveTab('monthly')} 
                icon={<TrendingUp size={14} />}
              />
              <SideNavItem 
                active={activeTab === 'yearly'}
                label="Yearly Budget (BB)" 
                onClick={() => setActiveTab('yearly')} 
                icon={<Layers size={14} />}
              />
              <SideNavItem 
                active={activeTab === 'mtp'}
                label="MTP Budget (3Yr)" 
                onClick={() => setActiveTab('mtp')} 
                icon={<Calendar size={14} />}
              />
              <SideNavItem 
                active={activeTab === 'pdc'}
                label="PDC Summary" 
                onClick={() => setActiveTab('pdc')} 
                icon={<PieIcon size={14} />}
              />
            </div>

            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-8 mb-4">Planning (P2)</h3>
            <div className="space-y-1">
              <SideNavItem 
                active={activeTab === 'inventory'}
                label="Inventory for Sale" 
                onClick={() => setActiveTab('inventory')} 
                icon={<Box size={14} />}
              />
              <SideNavItem 
                active={activeTab === 'suggestion'}
                label="Prod Suggestion" 
                onClick={() => setActiveTab('suggestion')} 
                icon={<Truck size={14} />}
              />
            </div>
          </div>

          <div className="p-4 border-t border-slate-200">
            <div className="bg-slate-900 rounded-lg p-3 shadow-inner">
              <p className="text-[8px] text-slate-500 uppercase font-black mb-1">System Status</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <p className="text-[10px] text-green-400 font-mono tracking-tighter">SQL_LIVE_READY</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 bg-white flex flex-col overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'forecast' && (
              <motion.div 
                key="forecast"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <ForecastInputTable
                  registrations={filteredRegistrations}
                  allRegistrations={registrations}
                  columnFilters={columnFilters}
                  onColumnFiltersChange={setColumnFilters}
                  monthsToShow={monthsToShow}
                  forecastData={forecastData}
                  cplPrices={cplPrices}
                  selectedVersion={selectedVersion}
                  selectedDimension={selectedDimension}
                  selectedType={selectedType}
                  onForecastChange={handleForecastChange}
                  onExport={exportToExcel}
                  forecastMode={forecastMode}
                />

                {/* Bottom Status Bar */}
                <div className="h-10 border-t border-slate-200 bg-slate-50 px-6 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Input Mode (Qty/Fcst)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Reference (Actual/Formula)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-slate-400 font-serif italic">Pending Changes: {forecastData.filter(f => f.qtyFcst > 0).length} units</span>
                    <button 
                      onClick={() => {
                        const btn = document.activeElement as HTMLButtonElement;
                        const originalText = btn.innerText;
                        btn.innerText = 'COMMITTING...';
                        btn.disabled = true;
                        setTimeout(() => {
                          btn.innerText = '✅ UPDATED SUCCESSFULLY';
                          btn.classList.replace('bg-green-600', 'bg-blue-600');
                          setTimeout(() => {
                            btn.innerText = originalText;
                            btn.classList.replace('bg-blue-600', 'bg-green-600');
                            btn.disabled = false;
                          }, 2000);
                        }, 1000);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-4 py-1.5 rounded shadow-sm hover:shadow-md transition-all active:scale-95 uppercase tracking-wider disabled:opacity-50"
                    >
                      Commit Updates
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'master' && (
              <motion.div 
                key="master"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div ref={cplTableRef} className="flex-1 overflow-auto">
                  <table className="w-full border-collapse table-fixed min-w-[800px]">
                    <thead className="sticky top-0 z-20 bg-slate-100">
                      <tr className="divide-x divide-slate-200">
                        <th className="w-1/4 p-4 text-[10px] font-black uppercase text-slate-400 text-left">Accounting Period</th>
                        <th className="w-1/4 p-4 text-[10px] font-black uppercase text-slate-400 text-left uppercase">Period Description</th>
                        <th className="w-1/4 p-4 text-[10px] font-black uppercase text-slate-400 text-right uppercase tracking-widest">Standard CPL Base Price (USD)</th>
                        <th className="w-1/4 p-4 text-[10px] font-black uppercase text-slate-400 text-center uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {filteredCplPrices.map(cpl => (
                        <tr key={cpl.month} className="divide-x divide-slate-50 hover:bg-slate-50/50 transition group">
                          <td className="p-4 font-mono text-slate-400 uppercase group-hover:text-blue-600 transition-colors">{cpl.month}</td>
                          <td className="p-4 text-slate-700 font-bold">{format(parseISO(cpl.month + '-01'), 'MMMM yyyy')}</td>
                          <td className="p-4 bg-blue-50/10">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-slate-300">$</span>
                              <input 
                                type="number" 
                                value={cpl.price}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  setCplPrices(prev => prev.map(p => p.month === cpl.month ? { ...p, price: val } : p));
                                }}
                                className="bg-white border border-slate-200 group-hover:border-blue-400 rounded-lg px-3 py-1.5 font-mono font-bold text-lg text-right w-40 focus:ring-4 focus:ring-blue-100 outline-none transition-all shadow-sm"
                              />
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => {
                                if (confirm(`Remove price for ${cpl.month}?`)) {
                                  setCplPrices(prev => prev.filter(p => p.month !== cpl.month));
                                }
                              }}
                              className="text-red-400 hover:text-red-600 text-[10px] font-black uppercase tracking-widest hover:underline transition-all"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredCplPrices.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-12 text-center">
                            <div className="flex flex-col items-center gap-2 opacity-30">
                              <Calendar size={48} />
                              <p className="font-bold uppercase tracking-widest text-xs">No data for FY {String(selectedFy).slice(-2)}</p>
                              <button 
                                onClick={() => setIsAddingCpl(true)}
                                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-[10px] font-bold"
                              >
                                Initialize FY {String(selectedFy).slice(-2)}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Bottom Status Bar */}
                <div className="h-10 border-t border-slate-200 bg-slate-50 px-6 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Master Data Live</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-slate-400 font-serif italic">Viewing FY {String(selectedFy).slice(-2)} · Records: {filteredCplPrices.length}</span>
                    <button 
                      onClick={() => {
                        const btn = document.activeElement as HTMLButtonElement;
                        const originalText = btn.innerText;
                        btn.innerText = 'SAVING...';
                        btn.disabled = true;
                        setTimeout(() => {
                          btn.innerText = '✅ SAVED SUCCESSFULLY';
                          btn.classList.replace('bg-green-600', 'bg-blue-600');
                          setTimeout(() => {
                            btn.innerText = originalText;
                            btn.classList.replace('bg-blue-600', 'bg-green-600');
                            btn.disabled = false;
                          }, 2000);
                        }, 800);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-4 py-1.5 rounded shadow-sm transition-all active:scale-95 uppercase tracking-wider disabled:opacity-50"
                    >
                      Save All Changes
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-8 grid grid-cols-6 gap-6 overflow-auto"
              >
                <StatCard label="Yearly Projection" value="$1.4M" trend="+12%" color="blue" subtitle="Total Sales Volume FY26" />
                <StatCard label="Forecast Variance" value="-8.4%" trend="-2%" color="red" subtitle="Delta: Fcst vs Budget (SepF)" />
                <StatCard label="CPL Stability" value="98.2%" trend="+0.5%" color="green" subtitle="Price formula match rate" />

                <div className="col-span-full bg-slate-900 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                    <RefreshCw size={240} className="animate-spin-slow text-white" />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6 text-blue-400">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em]">PDC Intelligence Engine</span>
                    </div>
                    <h3 className="text-2xl text-white font-bold tracking-tight mb-4">Phase 2: Production Suggestion</h3>
                    <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-3xl font-medium">
                      Machine learning identifies a <span className="text-blue-400 font-bold">15% supply gap</span> for Nylon-A6 in Q3. 
                      Strategic suggestion: Shift maintenance cycle for Line 4 from August to September to maximize output during the iPhone ramp-up period.
                    </p>
                    <div className="flex gap-4">
                      <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest transition shadow-lg shadow-blue-500/20 active:scale-95">
                        Download Inventory Report
                      </button>
                      <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest transition" onClick={() => setActiveTab('suggestion')}>
                        Full Scenario Analysis
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'weekly' && <ReportView onShowDetail={() => setShowDetailModal(true)} title="Weekly Sales Report" description="Performance tracking by week and registration" data={forecastData} registrations={registrations} type="weekly" />}
            {activeTab === 'monthly' && <ReportView onShowDetail={() => setShowDetailModal(true)} title="Monthly Sales Report" description="Consolidated monthly performance vs previous year" data={forecastData} registrations={registrations} type="monthly" />}
            {activeTab === 'yearly' && <BudgetView title="Yearly Budget - FY26" subtitle="Comparison: BB vs SepF vs DecF" registrations={registrations} />}
            {activeTab === 'mtp' && <BudgetView title="MTP Budget (3Yr Horizon)" subtitle="Strategic 3-year capacity & sales planning" isMtp registrations={registrations} />}
            {activeTab === 'pdc' && <PdcSummaryView data={forecastData} version={selectedVersion} registrations={registrations} />}
            {activeTab === 'inventory' && <PlaceholderView title="Inventory for Sale" icon={<Box size={48} />} />}
            {activeTab === 'suggestion' && <PlaceholderView title="Production Suggestion" icon={<Truck size={48} />} />}
          </AnimatePresence>
        </main>
      </div>

      {isAddingCpl && (
        <AddCplModal 
          fy={selectedFy} 
          cplPrices={cplPrices}
          onClose={() => setIsAddingCpl(false)} 
          onAdd={(month, price) => {
            setCplPrices(prev => [...prev, { month, price }].sort((a, b) => a.month.localeCompare(b.month)));
            setIsAddingCpl(false);
          }}
        />
      )}

      {showDetailModal && (
        <DetailModal 
          onClose={() => setShowDetailModal(false)} 
          data={forecastData} 
          registrations={registrations}
        />
      )}
    </div>
  );
}

function DetailModal({ onClose, data, registrations }: { onClose: () => void; data: ForecastValue[]; registrations: Registration[] }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Sales Report Details</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Registration Breakdown</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
              <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <th className="p-4 text-left">Registration</th>
                <th className="p-4 text-left">Product</th>
                <th className="p-4 text-right">Actual Qty</th>
                <th className="p-4 text-right">Forecast Qty</th>
                <th className="p-4 text-right">Variance</th>
                <th className="p-4 text-right">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs font-semibold">
              {registrations.map(reg => {
                const regData = data.filter(d => d.registrationId === reg.id);
                const act = regData.reduce((s, c) => s + c.qtyAct, 0);
                const fcst = regData.reduce((s, c) => s + c.qtyFcst, 0);
                const variance = act - fcst;
                const perf = fcst > 0 ? (act / fcst) * 100 : 0;
                
                return (
                  <tr key={reg.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-4">
                      <span className="text-slate-900 font-bold">{reg.registrationTopic}</span>
                      <p className="text-[10px] text-slate-400 uppercase">{reg.ownerName}</p>
                    </td>
                    <td className="p-4 text-slate-500">{reg.materialDescription}</td>
                    <td className="p-4 text-right font-mono text-slate-700">{act.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono text-blue-600">{fcst.toLocaleString()}</td>
                    <td className={`p-4 text-right font-mono ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance > 0 ? '+' : ''}{variance.toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black ${perf >= 90 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {perf.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition shadow-lg"
          >
            Close Window
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AddCplModal({ fy, onClose, onAdd, cplPrices }: { fy: number; onClose: () => void; onAdd: (month: string, price: number) => void; cplPrices: CPLPrice[] }) {
  const [selectedMonth, setSelectedMonth] = useState('04');
  const [price, setPrice] = useState<number>(3500);

  const months = ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03'];
  
  const getFullMonth = (m: string) => {
    const year = Number(m) >= 4 ? fy : fy + 1;
    return `${year}-${m}`;
  };

  const isAlreadyExists = cplPrices.some(c => c.month === getFullMonth(selectedMonth));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
      >
        <h3 className="text-xl font-bold text-slate-800 mb-2">Add Monthly CPL Base</h3>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Fiscal Year {fy} Management</p>

        <div className="space-y-6">
          <FilterGroup label="Select Month">
            <div className="grid grid-cols-4 gap-2">
              {months.map(m => {
                const fullMonth = getFullMonth(m);
                const exists = cplPrices.some(c => c.month === fullMonth);
                return (
                  <button 
                    key={m}
                    disabled={exists}
                    onClick={() => setSelectedMonth(m)}
                    className={cn(
                      "py-2 rounded-xl text-[10px] font-black uppercase border transition-all",
                      selectedMonth === m ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30" : 
                      exists ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through" : 
                      "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
                    )}
                  >
                    {format(parseISO(fullMonth + '-01'), 'MMM')}
                    <span className="block text-[8px] opacity-60 font-bold">{fullMonth.split('-')[0]}</span>
                  </button>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup label="Standard Base Price (USD)">
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
              <input 
                type="number"
                autoFocus
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-8 pr-4 text-2xl font-mono font-black text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                placeholder="0.00"
              />
            </div>
          </FilterGroup>

          <div className="pt-4 flex flex-col gap-3">
            <button 
              disabled={isAlreadyExists}
              onClick={() => onAdd(getFullMonth(selectedMonth), price)}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
            >
              Confirm and Add Month
            </button>
            <button 
              onClick={onClose}
              className="w-full py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
            >
              Nevermind, Go Back
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// --- Component Views ---

function ReportView({ title, description, data, registrations, type, onShowDetail }: { title: string; description: string; data: ForecastValue[]; registrations: Registration[]; type: 'weekly' | 'monthly'; onShowDetail: () => void }) {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const trendData = useMemo(() => {
    const months = [...new Set(data.map(d => d.month))].sort();
    return months.map(m => ({
      name: format(parseISO(m + '-01'), type === 'weekly' ? 'w\'WW' : 'MMM'),
      act: data.filter(d => d.month === m).reduce((s, c) => s + c.qtyAct, 0),
      fcst: data.filter(d => d.month === m).reduce((s, c) => s + c.qtyFcst, 0),
      variance: data.filter(d => d.month === m).reduce((s, c) => s + (c.qtyAct - c.qtyFcst), 0),
    }));
  }, [data, type]);

  const productData = useMemo(() => {
    const products: Record<string, number> = {};
    data.forEach(d => {
      const reg = registrations.find(r => r.id === d.registrationId);
      if (reg) {
        products[reg.materialDescription] = (products[reg.materialDescription] || 0) + d.qtyAct;
      }
    });
    return Object.entries(products).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, registrations]);

  const ownerData = useMemo(() => {
    const owners: Record<string, number> = {};
    data.forEach(d => {
      const reg = registrations.find(r => r.id === d.registrationId);
      if (reg) {
        owners[reg.ownerName] = (owners[reg.ownerName] || 0) + d.qtyAct;
      }
    });
    return Object.entries(owners).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, registrations]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-auto bg-slate-50/30">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4 bg-white px-8 pt-4 sticky top-0 z-30 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{title}</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">{description}</p>
        </div>
        <div className="flex gap-2 pb-1">
          <button 
            onClick={() => {
              const worksheet = XLSX.utils.json_to_sheet(trendData);
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, worksheet, "Performance_Trend");
              XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
            }}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition shadow-sm"
          >
            <Download size={14} /> Export XLS
          </button>
          <button 
            onClick={onShowDetail}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition shadow-lg"
          >
            <TrendingUp size={14} /> Full Analytics
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8 pb-12">
        {/* Hero KPIs */}
        <div className="grid grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Actual Qty</p>
          <div className="flex items-end gap-2">
            <h4 className="text-2xl font-black text-slate-800 tracking-tighter">{data.reduce((s, c) => s + c.qtyAct, 0).toLocaleString()}</h4>
            <span className="text-[10px] text-green-500 font-bold mb-1">+12% vs LY</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Forecast Bias</p>
          <div className="flex items-end gap-2">
            <h4 className="text-2xl font-black text-slate-800 tracking-tighter">
              {((data.reduce((s, c) => s + c.qtyAct, 0) / data.reduce((s, c) => s + c.qtyFcst, 1)) * 100 - 100).toFixed(1)}%
            </h4>
            <span className="text-[10px] text-blue-500 font-bold mb-1">Under-forecasting</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Hit Rate</p>
          <div className="flex items-end gap-2">
            <h4 className="text-2xl font-black text-slate-800 tracking-tighter">
              {(Math.min(data.reduce((s, c) => s + c.qtyAct, 0), data.reduce((s, c) => s + c.qtyFcst, 0)) / Math.max(data.reduce((s, c) => s + c.qtyAct, 0), data.reduce((s, c) => s + c.qtyFcst, 1)) * 100).toFixed(1)}%
            </h4>
            <span className="text-[10px] text-amber-500 font-bold mb-1">Stable Accuracy</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-400 transition-all active:scale-95" onClick={onShowDetail}>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Monthly Detail</p>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-blue-600 underline uppercase tracking-widest">Open Details</h4>
            <ChevronRight size={14} className="text-blue-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Chart 1: Trend */}
        <div className="col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[450px] flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600" />
              Sales Performance Trend
            </h3>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Actual</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> Forecast</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorActView" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorFcstView" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
              />
              <Area type="monotone" dataKey="act" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorActView)" name="Actual" />
              <Area type="monotone" dataKey="fcst" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorFcstView)" name="Forecast" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Product Mix */}
        <div className="col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[450px] flex flex-col">
          <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
            <PieIcon size={16} className="text-orange-500" />
            Product Volume Mix
          </h3>
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {productData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Owner Performance */}
        <div className="col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
          <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
            <BarChart3 size={16} className="text-purple-500" />
            Performance by Sale Owner
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={ownerData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} hide />
              <YAxis dataKey="name" type="category" fontSize={10} axisLine={false} tickLine={false} width={100} tick={{fill: '#64748b', fontWeight: 'bold'}} />
              <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={24}>
                {ownerData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                ))}
              </Bar>
            </ReBarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 4: Variance Analysis */}
        <div className="col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
          <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
            <RefreshCw size={16} className="text-red-500" />
            Act vs Fcst Monthly Variance
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="variance" radius={[6, 6, 0, 0]} barSize={32}>
                {trendData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.variance >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </ReBarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  </motion.div>
);
}

function InsightItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 font-bold uppercase">{label}</p>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-[10px] text-blue-400 font-medium italic">{sub}</p>
    </div>
  );
}

function BudgetView({ title, subtitle, isMtp, registrations }: { title: string; subtitle: string; isMtp?: boolean; registrations: Registration[] }) {
  const years = isMtp ? ['2026', '2027', '2028'] : ['FY26 BB', 'FY26 SepF', 'FY26 DecF'];
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-auto bg-slate-50/30">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4 bg-white px-8 pt-4 sticky top-0 z-30 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{title}</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="p-8 space-y-8 pb-12">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="divide-x divide-slate-200">
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 w-64">Registration / Scope</th>
              {years.map(y => (
                <th key={y} className="p-4 text-[10px] font-black uppercase text-blue-600 text-center">{y}</th>
              ))}
              <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-center w-32">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-medium">
            {registrations.map(reg => (
              <tr key={reg.id} className="divide-x divide-slate-50 hover:bg-slate-50/50 transition">
                <td className="p-4">
                  <span className="font-bold text-slate-900">{reg.registrationTopic}</span>
                  <p className="text-[10px] text-slate-400">{reg.materialDescription} · {reg.countryName}</p>
                </td>
                {years.map(y => (
                  <td key={y} className="p-4 text-center font-mono">{(Math.random() * 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                ))}
                <td className="p-4 text-center">
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    Math.random() > 0.5 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                  )}>
                    {Math.random() > 0.5 ? '+' : '-'}{(Math.random() * 5).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </motion.div>
);
}

function PdcSummaryView({ data, version, registrations }: { data: ForecastValue[]; version: string; registrations: Registration[] }) {
  const summary = useMemo(() => {
    // Group by product
    const products = [...new Set(registrations.map(r => r.materialDescription))];
    return products.map(p => {
      const regs = registrations.filter(r => r.materialDescription === p);
      const qty = data
        .filter(d => regs.some(r => r.id === d.registrationId) && d.version === version)
        .reduce((s, c) => s + c.qtyFcst, 0);
      return { product: p, qty };
    });
  }, [data, version, registrations]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-auto bg-slate-50/30">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4 bg-white px-8 pt-4 sticky top-0 z-30 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Production Control Summary</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Aggregated Qty for Manufacturing Planning · {version}</p>
        </div>
      </div>

      <div className="p-8 space-y-8 pb-12">
        <div className="grid grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-6">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Box size={16} className="text-blue-600" />
            Product Allocation
          </h3>
          <div className="flex-1 space-y-4">
            {summary.map(s => (
              <div key={s.product} className="flex flex-col gap-2">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-700">{s.product}</span>
                  <span className="text-[10px] font-mono text-slate-400 tracking-tighter">{s.qty.toLocaleString()} Units</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(100, (s.qty / 2000) * 100)}%` }} 
                    className="h-full bg-blue-600 rounded-full" 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center text-blue-600">
            <Plus size={32} />
          </div>
          <div>
            <h4 className="font-bold text-slate-900">Custom PDC Profile</h4>
            <p className="text-xs text-slate-500 max-w-[200px] mt-1">Create a new summary view with custom product groups or destinations.</p>
          </div>
          <button className="bg-slate-900 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider">Configure</button>
        </div>
      </div>
    </div>
  </motion.div>
);
}

function PlaceholderView({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
      <div className="text-slate-200 animate-pulse">{icon}</div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-400">{title}</h2>
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1 italic">Enterprise Phase 2 · Coming Soon</p>
      </div>
      <div className="max-w-md bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
        <p className="text-xs text-blue-600 leading-relaxed font-medium">
          This system is being prepared for Microsoft SQL Server integration. Phase 2 modules will include real-time inventory synchronization and AI-driven production capacity suggestions.
        </p>
      </div>
    </motion.div>
  );
}

// --- Status/Nav Helpers ---

function SideNavItem({ active, label, onClick, disabled, icon }: { active?: boolean; label: string; onClick: () => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <button 
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full text-left p-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all flex items-center gap-2",
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-l-4 border-white" 
          : disabled 
            ? "text-slate-300 italic cursor-not-allowed opacity-50" 
            : "text-slate-600 hover:bg-white hover:text-slate-900 border-l-4 border-transparent"
      )}
    >
      {icon && <span className={cn(active ? "text-white" : "text-slate-400")}>{icon}</span>}
      {label}
    </button>
  );
}

function FilterGroup({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-0.5">{label}</span>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, trend, color, subtitle }: { label: string; value: string; trend: string; color: 'blue' | 'green' | 'red'; subtitle: string }) {
  const themes = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    green: "text-emerald-600 bg-emerald-50 border-emerald-100",
    red: "text-rose-600 bg-rose-50 border-rose-100"
  };
  
  return (
    <div className="col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-[10px] uppercase font-black tracking-widest">{label}</span>
        <span className={cn("px-2 py-1 rounded-full text-[10px] font-black border", themes[color])}>
          {trend}
        </span>
      </div>
      <div>
        <span className="text-4xl font-black tracking-tighter text-slate-900">{value}</span>
        <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-tight">{subtitle}</p>
      </div>
    </div>
  );
}
