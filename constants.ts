import { FreddoYearData } from './types';

export const FREDDO_DATA: FreddoYearData[] = [
  { year: 1995, price: 10, isGoldenEra: true },
  { year: 1996, price: 10, isGoldenEra: true },
  { year: 1997, price: 10, isGoldenEra: true },
  { year: 1998, price: 10, isGoldenEra: true },
  { year: 1999, price: 10, isGoldenEra: true },
  { year: 2000, price: 10, isGoldenEra: true },
  { year: 2001, price: 10, isGoldenEra: true },
  { year: 2002, price: 10, isGoldenEra: true },
  { year: 2003, price: 10, isGoldenEra: true },
  { year: 2004, price: 10, isGoldenEra: true },
  { year: 2005, price: 10, isGoldenEra: true },
  { year: 2006, price: 10, isGoldenEra: true },
  { year: 2007, price: 15, isGoldenEra: false },
  { year: 2008, price: 15, isGoldenEra: false },
  { year: 2009, price: 15, isGoldenEra: false },
  { year: 2010, price: 15, isGoldenEra: false },
  { year: 2011, price: 17, isGoldenEra: false }, // Slight bump
  { year: 2012, price: 20, isGoldenEra: false },
  { year: 2013, price: 20, isGoldenEra: false },
  { year: 2014, price: 20, isGoldenEra: false },
  { year: 2015, price: 25, isGoldenEra: false },
  { year: 2016, price: 25, isGoldenEra: false },
  { year: 2017, price: 30, isGoldenEra: false },
  { year: 2018, price: 25, isGoldenEra: false }, // The temporary dip
  { year: 2019, price: 30, isGoldenEra: false },
  { year: 2020, price: 30, isGoldenEra: false },
  { year: 2021, price: 30, isGoldenEra: false },
  { year: 2022, price: 30, isGoldenEra: false },
  { year: 2023, price: 30, isGoldenEra: false },
  { year: 2024, price: 35, isGoldenEra: false },
  { year: 2025, price: 35, isGoldenEra: false }, // Projected/Current
];

export const GEMINI_SYSTEM_INSTRUCTION = `
You are a creative writer generating fake vox-pop quotes from British citizens reacting to the price of a Freddo chocolate bar in a specific year.
The tone should be typically British: cynical, sarcastic, nostalgic, or outraged depending on the price.
When given a year and a price, provide:
1. A short, punchy quote (max 20 words).
2. A fictional persona name and a UK town/city (e.g., "Barbara, Wakefield", "Dave, Luton").
`;