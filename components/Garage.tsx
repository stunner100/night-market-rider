"use client";
import { useEffect, useState } from "react";
import { useGame, buyBike, selectBike } from "@/game/store";
import { BIKES, statBars } from "@/game/bikes";

/** Pick or buy a bike. The menu bike behind the dialog is repainted to preview it. */
export default function Garage() {
  const s = useGame();
  const [i, setI] = useState(Math.max(0, BIKES.findIndex((b) => b.id === s.bike)));
  const bike = BIKES[i];
  const owned = s.ownedBikes.includes(bike.id);
  const current = s.bike === bike.id;
  const canAfford = s.earnings >= bike.price;

  useEffect(() => {
    useGame.getState().set({ garagePreview: bike.id });
  }, [bike.id]);

  const close = () => s.set({ garageOpen: false, garagePreview: null });
  const step = (d: number) => setI((n) => (n + d + BIKES.length) % BIKES.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="garage-shade">
      <section className="garage" aria-label="Garage">
        <header>
          <button onClick={close} aria-label="Close garage">‹ Back</button>
          <p className="eyebrow">GARAGE · GH₵{s.earnings.toFixed(2)}</p>
        </header>
        <div className="garage-pick">
          <button onClick={() => step(-1)} aria-label="Previous bike">‹</button>
          <div>
            <h2>{bike.name}</h2>
            <div className="garage-dots" aria-hidden="true">
              {BIKES.map((b, n) => <i key={b.id} className={n === i ? "on" : ""} />)}
            </div>
          </div>
          <button onClick={() => step(1)} aria-label="Next bike">›</button>
        </div>
        <p className="garage-tag">{bike.tagline}</p>
        <dl className="garage-stats">
          {Object.entries(statBars(bike)).map(([label, n]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd aria-label={`${n} of 5`}>
                {[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= n ? "on" : ""} />)}
              </dd>
            </div>
          ))}
        </dl>
        {current ? (
          <button className="btn btn-ghost" disabled>YOU DEY RIDE AM</button>
        ) : owned ? (
          <button className="btn btn-primary" onClick={() => { selectBike(bike.id); close(); }}>RIDE THIS ONE</button>
        ) : (
          <button className="btn btn-primary" disabled={!canAfford} onClick={() => { if (buyBike(bike.id)) close(); }}>
            {canAfford ? `BUY · GH₵${bike.price}` : `GH₵${bike.price} · you need GH₵${(bike.price - s.earnings).toFixed(2)} more`}
          </button>
        )}
        <p className="muted">Shift + steer to drift · tuck in behind trotros to slipstream</p>
      </section>
    </div>
  );
}
