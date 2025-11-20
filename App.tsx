import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import FreddoChart from './components/FreddoChart';
import FreddoDetails from './components/FreddoDetails';
import { FREDDO_DATA } from './constants';
import { FreddoYearData, CommentaryResponse, LoadingState } from './types';
import { fetchFreddoCommentary } from './services/geminiService';

const App: React.FC = () => {
  // Default to current year
  const [selectedData, setSelectedData] = useState<FreddoYearData>(FREDDO_DATA[FREDDO_DATA.length - 1]);
  const [commentary, setCommentary] = useState<CommentaryResponse | null>(null);
  const [loading, setLoading] = useState<LoadingState>(LoadingState.IDLE);

  const handleYearSelect = (data: FreddoYearData) => {
    setSelectedData(data);
  };

  useEffect(() => {
    let isMounted = true;

    const getCommentary = async () => {
      setLoading(LoadingState.LOADING);
      // Short delay to allow UI to show loading state comfortably and avoid flicker
      await new Promise(r => setTimeout(r, 300));
      
      const result = await fetchFreddoCommentary(selectedData.year, selectedData.price);
      
      if (isMounted) {
        setCommentary(result);
        setLoading(LoadingState.SUCCESS);
      }
    };

    getCommentary();

    return () => {
      isMounted = false;
    };
  }, [selectedData]);

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-800">
      <Header />

      <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left Column: Chart (Takes up 2/3 on large screens) */}
          <div className="lg:col-span-2 flex flex-col gap-12">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
               <div className="prose prose-purple max-w-none mb-4">
                 <h2 className="font-display text-2xl text-cadbury">The Trajectory of Tragedy</h2>
                 <p className="text-gray-600">
                   Select a bar below to see what life was like when Freddos were affordable (or not).
                 </p>
               </div>
               <FreddoChart 
                  data={FREDDO_DATA} 
                  selectedYear={selectedData.year} 
                  onYearSelect={handleYearSelect} 
               />
            </div>
            
            {/* Extra Context / Footer for Chart */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-cadbury text-white p-4 rounded-2xl flex flex-col justify-center items-center text-center">
                    <span className="text-3xl font-bold">260%</span>
                    <span className="text-xs opacity-80 uppercase tracking-wider">Total Inflation since 1995</span>
                </div>
                <div className="bg-freddo-green text-white p-4 rounded-2xl flex flex-col justify-center items-center text-center">
                     <span className="text-3xl font-bold">10p</span>
                     <span className="text-xs opacity-80 uppercase tracking-wider">Lowest Price</span>
                </div>
                <div className="bg-freddo-red text-white p-4 rounded-2xl flex flex-col justify-center items-center text-center">
                     <span className="text-3xl font-bold">35p</span>
                     <span className="text-xs opacity-80 uppercase tracking-wider">Peak Panic</span>
                </div>
            </div>
          </div>

          {/* Right Column: Details Card (Takes up 1/3 on large screens) */}
          <div className="lg:col-span-1 h-auto lg:sticky lg:top-32">
            <FreddoDetails 
              data={selectedData} 
              commentary={commentary} 
              loading={loading} 
            />
          </div>

        </div>
      </main>

      <footer className="bg-cadbury-dark text-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center opacity-60 text-sm">
          <p>&copy; {new Date().getFullYear()} The Freddo Index. Not affiliated with Cadbury.</p>
          <p className="mt-2 text-xs">Data approximated from user submissions and hysterical memories of simpler times.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;