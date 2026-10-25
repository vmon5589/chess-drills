import openingsJson from '../data/openings.json';
import type { QuizLine, TrainerLine } from './types';

export const TRAINER_LINES = openingsJson.trainer as TrainerLine[];
export const QUIZ_LINES = openingsJson.quiz as QuizLine[];

export const familyOf = (name: string) => name.split(':')[0];
