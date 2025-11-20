import React from 'react';
import { FreddoYearData, CommentaryResponse, LoadingState } from '../types';

interface FreddoDetailsProps {
  data: FreddoYearData;
  commentary: CommentaryResponse | null;
  loading: LoadingState;
}

const FreddoDetails: React.FC<FreddoDetailsProps> = ({ data, commentary, loading }) => {
  
  const isGoldenEra = data.price === 10;

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-cadbury/10 transition-all duration-300 hover:shadow-2xl h-full flex flex-col">
      
      {/* Card Header */}
      <div className={`p-6 ${isGoldenEra ? 'bg-freddo-red text-white' : 'bg-cadbury-light text-white'} relative overflow-hidden`}>
        <div className="absolute -right-10 -top-10 opacity-20 transform rotate-12">
             <svg width="150" height="150" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
        </div>
        
        <h2 className="text-4xl font-display font-bold mb-1">{data.year}</h2>
        <div className="flex items-baseline gap-2">
            <span className="text-6xl font-bold tracking-tighter">{data.price}p</span>
            {isGoldenEra && <span className="bg-yellow-400 text-red-900 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-widest shadow-sm">The Golden Era</span>}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-6 flex-grow flex flex-col gap-6 relative">
        
        {/* AI Commentary / Quote Area */}
        <div className="bg-purple-50 rounded-xl p-8 border border-purple-100 flex-grow relative min-h-[200px] flex flex-col justify-center items-center text-center">
            
            {loading === LoadingState.LOADING ? (
                 <div className="flex flex-col items-center justify-center text-cadbury gap-2">
                    <div className="animate-spin text-2xl">🐸</div>
                    <span className="text-sm font-semibold animate-pulse">Polling the public...</span>
                 </div>
            ) : commentary ? (
                <div className="animate-fade-in-up">
                    <p className="text-xl md:text-2xl text-cadbury font-display font-bold mb-6 leading-snug">
                        "{commentary.quote}"
                    </p>
                    <div className="inline-block bg-white px-4 py-2 rounded-full shadow-sm border border-purple-100">
                        <p className="text-gray-600 font-medium text-sm">
                             — {commentary.author}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Select a bar to hear what people thought
                </div>
            )}
        </div>

        {/* Inflation Context */}
        <div className="text-center border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">
                {data.year === 2025 ? "Present Day" : `${2025 - data.year} years ago`}
            </p>
        </div>

      </div>
    </div>
  );
};

export default FreddoDetails;