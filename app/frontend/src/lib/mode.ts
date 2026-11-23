import { TODAY as demoDate } from '../data/mock';
import { todayISO } from './dates';

export const isDemoMode = import.meta.env.MODE === 'demo';
export const TODAY = isDemoMode ? demoDate : todayISO();
