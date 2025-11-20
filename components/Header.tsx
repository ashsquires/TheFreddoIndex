import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="w-full bg-cadbury text-white py-6 shadow-lg sticky top-0 z-50 border-b-4 border-freddo-green">
      <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="text-3xl animate-bounce">🐸</div>
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-wide text-white">
              The Freddo Index
            </h1>
            <p className="text-xs md:text-sm text-cadbury-accent opacity-80 font-sans">
              Tracking inflation, one frog at a time.
            </p>
          </div>
        </div>
        <div className="hidden md:block text-right">
            <div className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full">
                Current Price: 35p 😱
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;