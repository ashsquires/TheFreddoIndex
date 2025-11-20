import Chart from 'chart.js/auto';
import { FREDDO_DATA } from './constants';
import { fetchFreddoCommentary } from './services/geminiService';
import { LoadingState } from './types';

// State
let currentState = {
  selectedYear: FREDDO_DATA[FREDDO_DATA.length - 1].year,
  price: FREDDO_DATA[FREDDO_DATA.length - 1].price,
  isGoldenEra: FREDDO_DATA[FREDDO_DATA.length - 1].isGoldenEra,
  loading: LoadingState.IDLE
};

let chartInstance: Chart | null = null;

// DOM Elements
const els = {
  headerPrice: document.getElementById('header-current-price'),
  detailsYear: document.getElementById('details-year'),
  detailsPrice: document.getElementById('details-price'),
  detailsHeaderBg: document.getElementById('details-header-bg'),
  detailsGoldenBadge: document.getElementById('details-golden-badge'),
  detailsLoading: document.getElementById('details-loading'),
  detailsContent: document.getElementById('details-content'),
  detailsQuote: document.getElementById('details-quote'),
  detailsAuthor: document.getElementById('details-author'),
  detailsContext: document.getElementById('details-context'),
  footerYear: document.getElementById('footer-year'),
  canvas: document.getElementById('freddoChart') as HTMLCanvasElement
};

// Constants
const COLORS = {
  golden: '#D8B4FE',   // Light Purple
  inflation: '#8B5CF6', // Vivid Purple
  hover: '#6D28D9',     // Deep Purple
  selected: '#330072'   // Cadbury Purple
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  if (els.footerYear) els.footerYear.textContent = new Date().getFullYear().toString();
  initChart();
  updateUI();
  fetchQuote(); // Initial fetch
});

function initChart() {
  if (!els.canvas) return;

  const ctx = els.canvas.getContext('2d');
  if (!ctx) return;

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: FREDDO_DATA.map(d => d.year),
      datasets: [{
        data: FREDDO_DATA.map(d => d.price),
        borderRadius: 4,
        backgroundColor: getBackgroundColors(currentState.selectedYear),
        hoverBackgroundColor: COLORS.hover,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const selectedData = FREDDO_DATA[index];
          handleYearSelect(selectedData);
        }
      },
      onHover: (event, elements) => {
         if(event.native && event.native.target) {
            (event.native.target as HTMLElement).style.cursor = elements.length ? 'pointer' : 'default';
         }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#FFF',
          titleColor: '#330072',
          bodyColor: '#4CBB17',
          bodyFont: { size: 14, weight: 'bold' },
          titleFont: { size: 14, weight: 'bold', family: 'Fredoka' },
          borderColor: '#330072',
          borderWidth: 1,
          displayColors: false,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (context) => `${context.raw}p`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12, family: 'Inter' }, color: '#666' }
        },
        y: {
          border: { display: false },
          grid: { color: '#f0f0f0' },
          ticks: { 
              stepSize: 10,
              font: { size: 12, family: 'Inter' }, 
              color: '#666'
          },
          min: 0,
          max: 40
        }
      }
    }
  });
}

function getBackgroundColors(selectedYear: number) {
  return FREDDO_DATA.map(d => {
    if (d.year === selectedYear) return COLORS.selected;
    return d.isGoldenEra ? COLORS.golden : COLORS.inflation;
  });
}

async function handleYearSelect(data: any) {
  // Update State
  currentState.selectedYear = data.year;
  currentState.price = data.price;
  currentState.isGoldenEra = data.isGoldenEra;

  // Update Chart Colors
  if (chartInstance) {
    chartInstance.data.datasets[0].backgroundColor = getBackgroundColors(currentState.selectedYear);
    chartInstance.update();
  }

  // Update UI immediate
  updateUI();

  // Fetch API
  fetchQuote();
}

function updateUI() {
  if (!els.detailsYear) return;

  // Update Right Panel Static Data
  els.detailsYear.textContent = currentState.selectedYear.toString();
  if(els.detailsPrice) els.detailsPrice.textContent = `${currentState.price}p`;

  // Golden Era Styling
  if (currentState.isGoldenEra) {
    els.detailsHeaderBg?.classList.remove('bg-cadbury-light');
    els.detailsHeaderBg?.classList.add('bg-freddo-red');
    els.detailsGoldenBadge?.classList.remove('hidden');
  } else {
    els.detailsHeaderBg?.classList.add('bg-cadbury-light');
    els.detailsHeaderBg?.classList.remove('bg-freddo-red');
    els.detailsGoldenBadge?.classList.add('hidden');
  }

  // Context Text
  if(els.detailsContext) {
      const diff = 2025 - currentState.selectedYear;
      els.detailsContext.textContent = diff === 0 ? "Present Day" : `${diff} years ago`;
  }
}

async function fetchQuote() {
  setLoading(true);
  
  try {
    // Small artificial delay for UX
    await new Promise(r => setTimeout(r, 300));
    
    const response = await fetchFreddoCommentary(currentState.selectedYear, currentState.price);
    
    if (els.detailsQuote) els.detailsQuote.textContent = `"${response.quote}"`;
    if (els.detailsAuthor) els.detailsAuthor.textContent = `— ${response.author}`;

  } catch (e) {
    console.error(e);
    if (els.detailsQuote) els.detailsQuote.textContent = `"I'm speechless."`;
    if (els.detailsAuthor) els.detailsAuthor.textContent = `— Unknown`;
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading: boolean) {
  if (isLoading) {
    els.detailsLoading?.classList.remove('hidden');
    els.detailsLoading?.classList.add('flex');
    els.detailsContent?.classList.add('hidden');
  } else {
    els.detailsLoading?.classList.add('hidden');
    els.detailsLoading?.classList.remove('flex');
    els.detailsContent?.classList.remove('hidden');
  }
}