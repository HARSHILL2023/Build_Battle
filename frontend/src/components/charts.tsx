import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#1e7b34",
  neutral: "#8a5a00",
  negative: "#b3261e",
  unanalyzed: "#a89e8d",
};

const CATEGORY_COLORS = ["#0e6b5e", "#4a4439", "#8a5a00", "#6b7f7a", "#a89e8d"];

export function SentimentDonut({
  data,
  onSelect,
}: {
  data: { name: string; value: number }[];
  onSelect?: (sentiment: string) => void;
}) {
  return (
    <div className="h-56" role="img" aria-label="Sentiment distribution chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
            onClick={(entry) => {
              const name = (entry as unknown as { name?: string })?.name;
              if (name && onSelect) onSelect(name);
            }}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={SENTIMENT_COLORS[d.name] ?? "#a89e8d"} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [(value as number).toLocaleString(), "records"]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBars({
  data,
  onSelect,
  ariaLabel,
}: {
  data: { name: string; value: number; extra?: string }[];
  onSelect?: (name: string) => void;
  ariaLabel: string;
}) {
  return (
    <div style={{ height: Math.max(140, data.length * 40) }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5ddce" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} stroke="#756c5e" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            tick={{ fontSize: 12 }}
            stroke="#4a4439"
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
          />
          <Tooltip formatter={(value) => [(value as number).toLocaleString(), "records"]} />
          <Bar
            dataKey="value"
            radius={[2, 4, 4, 2]}
            onClick={(entry) => {
              const name = (entry as unknown as { name?: string })?.name;
              if (name && onSelect) onSelect(name);
            }}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
