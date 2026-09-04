import type { Block } from "./types";

export type Placed = {
  block: Block;
  /** Column index within its overlap cluster. */
  lane: number;
  /** How many columns that cluster needs. */
  lanes: number;
};

/**
 * Google-Calendar-style side-by-side layout for overlapping blocks.
 *
 * Blocks are swept in start order and gathered into clusters of transitively
 * overlapping items; within a cluster each block takes the first column whose
 * last occupant has already finished. A cluster's width is then split evenly.
 *
 * This matters more here than in a normal calendar: an overwhelmed VA stacks
 * four accounts on the same Monday morning, and if they render on top of each
 * other the view hides exactly the problem it exists to reveal.
 */
export function layoutDay(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMin - b.startMin || b.durationMin - a.durationMin
  );

  const out: Placed[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const columns: Block[][] = [];

    for (const item of cluster) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (last.startMin + last.durationMin <= item.startMin) {
          col.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([item]);
    }

    const lanes = columns.length;
    columns.forEach((col, lane) => {
      for (const block of col) out.push({ block, lane, lanes });
    });

    cluster = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.startMin + item.durationMin);
  }
  flush();

  return out;
}

/** Total booked minutes for a set of blocks. */
export function totalMinutes(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + b.durationMin, 0);
}
