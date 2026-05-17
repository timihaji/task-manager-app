export const D = {
  today: () => { const d = new Date(); d.setHours(0,0,0,0); return d; },
  str: (d) => {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(String(d) + 'T00:00:00');
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  },
  parse: (s) => new Date(String(s) + 'T00:00:00'),
  add: (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; },
  isTdy: (s) => !!s && s === D.str(D.today()),
  isFut: (s) => !!s && s > D.str(D.today()),
  isPst: (s) => !!s && s < D.str(D.today()),
  fmt: (s) => {
    if (!s) return '';
    const t = D.today(), d = D.parse(s), diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return d.toLocaleDateString('en', { weekday:'short', month:'short', day:'numeric' });
    if (diff < 0) return `${-diff}d ago`;
    return d.toLocaleDateString('en', { month:'short', day:'numeric' });
  },
  dow: (s) => D.parse(s).toLocaleDateString('en', { weekday:'short' }),
  daynum: (s) => D.parse(s).getDate(),
};

export const TODAY    = D.str(D.today());
export const TOMORROW = D.str(D.add(D.today(), 1));
export const YESTER   = D.str(D.add(D.today(), -1));
export const IN2  = D.str(D.add(D.today(), 2));
export const IN3  = D.str(D.add(D.today(), 3));
export const IN5  = D.str(D.add(D.today(), 5));
export const IN7  = D.str(D.add(D.today(), 7));
export const IN10 = D.str(D.add(D.today(), 10));
export const IN14 = D.str(D.add(D.today(), 14));

export const mkid = () => 't' + Math.random().toString(36).slice(2, 10);
