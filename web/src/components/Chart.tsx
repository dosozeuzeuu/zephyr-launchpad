'use client';

import { type IChartApi, type ISeriesApi, type UTCTimestamp, ColorType, createChart } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import type { Candle } from '@/lib/data';

/** Candles priced in market cap (HYPE), which reads better than tiny per-token prices. */
export function Chart({ candles }: { candles: Candle[] }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const vol = useRef<ISeriesApi<'Histogram'> | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9DA6D9', fontFamily: 'IBM Plex Sans, system-ui' },
      grid: { vertLines: { color: 'rgba(38,45,102,0.5)' }, horzLines: { color: 'rgba(38,45,102,0.5)' } },
      rightPriceScale: { borderColor: '#262D66', scaleMargins: { top: 0.1, bottom: 0.18 } },
      timeScale: { borderColor: '#262D66', timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { color: '#B7A8FF55' }, vertLine: { color: '#B7A8FF55' } },
    });
    series.current = c.addCandlestickSeries({
      upColor: '#5BE0B3',
      downColor: '#FF7D9C',
      borderVisible: false,
      wickUpColor: '#5BE0B3',
      wickDownColor: '#FF7D9C',
      priceFormat: { type: 'custom', minMove: 0.001, formatter: (p: number) => (p >= 1000 ? `${(p / 1000).toFixed(2)}K` : p.toFixed(2)) },
    });
    vol.current = c.addHistogramSeries({ priceScaleId: 'vol', color: '#262D66', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    chart.current = c;
    return () => c.remove();
  }, []);

  useEffect(() => {
    if (!series.current || !vol.current) return;
    const m = 1e9;
    series.current.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open * m, high: k.high * m, low: k.low * m, close: k.close * m })));
    vol.current.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, value: k.volume, color: k.close >= k.open ? 'rgba(91,224,179,0.35)' : 'rgba(255,125,156,0.35)' })));
    if (!fitted.current && candles.length) {
      chart.current?.timeScale().fitContent();
      fitted.current = true;
    }
  }, [candles]);

  return (
    <div className="relative h-[340px] sm:h-[420px]">
      <div ref={box} className="absolute inset-0" />
      {!candles.length && <p className="absolute inset-0 grid place-items-center text-mist text-sm">The chart starts with the first trade.</p>}
    </div>
  );
}
