export interface FreddoYearData {
  year: number;
  price: number;
  isGoldenEra: boolean; // True if price is 10p
}

export interface CommentaryResponse {
  quote: string;
  author: string;
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}