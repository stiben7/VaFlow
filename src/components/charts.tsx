"use client";

/**
 * Thin, opinionated Recharts wrappers. The dashboard pages never touch Recharts
 * internals -- all the theming (app colour tokens, hairline grid, the tooltip
 * card, direct value labels) lives here in one place.
 *
 * Colours are passed as CSS-var strings where they should follow the theme
 * (`var(--color-brand)`) and as plain hex where they follow an entity (a
 * client's own accent). The browser resolves the CSS var against the SVG node
 * at paint time, so a light/dark flip just works.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtHrs } from "@/lib/analytics";

type Fmt = (n: number) => string;

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; payload: { label: string } }>;
  label?: string | number;
  formatValue: Fmt;
};

function ChartTooltip({ active, payload, label, formatValue }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-edge bg-canvas px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="font-medium text-ink">{p.payload?.label ?? label}</div>
      <div className="text-muted tabular-nums">{formatValue(p.value)}</div>
    </div>
  );
}

export type BarDatum = { id?: string; label: string; value: number; color?: string };

export function Bars({
  data,
  direction = "column",
  color = "var(--color-brand)",
  formatValue = fmtHrs,
  height = 240,
}: {
  data: BarDatum[];
  /** "column" = upright bars (category on X). "row" = horizontal bars. */
  direction?: "column" | "row";
  color?: string;
  formatValue?: Fmt;
  height?: number;
}) {
  const row = direction === "row";
  const tick = { fill: "var(--color-faint)", fontSize: 11 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={row ? "vertical" : "horizontal"}
        margin={{ top: 10, right: row ? 46 : 12, bottom: 2, left: row ? 4 : 2 }}
        barCategoryGap={row ? "22%" : "18%"}
      >
        <CartesianGrid
          stroke="var(--color-edge)"
          horizontal={!row}
          vertical={row}
        />
        {row ? (
          <>
            <XAxis
              type="number"
              tick={tick}
              tickFormatter={formatValue}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={tick}
              width={104}
              axisLine={false}
              tickLine={false}
            />
          </>
        ) : (
          <>
            <XAxis
              type="category"
              dataKey="label"
              tick={tick}
              interval="preserveStartEnd"
              minTickGap={16}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="number"
              tick={tick}
              tickFormatter={formatValue}
              width={40}
              axisLine={false}
              tickLine={false}
            />
          </>
        )}
        <Tooltip
          cursor={{ fill: "var(--color-sunken)", opacity: 0.6 }}
          content={(props) => (
            <ChartTooltip {...(props as unknown as TooltipProps)} formatValue={formatValue} />
          )}
        />
        <Bar
          dataKey="value"
          fill={color}
          radius={row ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          maxBarSize={row ? 24 : 52}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={d.id ?? `${d.label}-${i}`} fill={d.color ?? color} />
          ))}
          <LabelList
            dataKey="value"
            position={row ? "right" : "top"}
            formatter={(v: unknown) => formatValue(Number(v))}
            fill="var(--color-muted)"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export type DonutSegment = { label: string; value: number; color: string };

export function Donut({
  segments,
  formatValue = fmtHrs,
  height = 200,
}: {
  segments: DonutSegment[];
  formatValue?: Fmt;
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--color-canvas)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {segments.map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...(props as unknown as TooltipProps)}
                  formatValue={formatValue}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[15px] font-semibold tabular-nums text-ink">
              {formatValue(total)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-faint">
              total
            </div>
          </div>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-1.5 text-[11px] text-muted"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
            <span className="tabular-nums text-faint">{formatValue(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
