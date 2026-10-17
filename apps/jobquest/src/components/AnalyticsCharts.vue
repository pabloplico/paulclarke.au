<script setup lang="ts">
import { RadarChart, TreemapChart } from 'echarts/charts';
import { AriaComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { type GroupsByCategory, groupColour, type SkillsByGroup } from '../lib/analytics';

// Only what these two charts need, so the Analytics chunk stays small. The SVG
// renderer draws real elements (no canvas), and the aria component gives each
// chart a text description and patterned fills, so colour isn't the only cue.
use([TreemapChart, RadarChart, TooltipComponent, LegendComponent, AriaComponent, SVGRenderer]);

const props = defineProps<{ byGroup: SkillsByGroup[]; byCategory: GroupsByCategory }>();

// White labels on the treemap's group colours are 4.5:1 or more (analytics.ts)
const treemap = computed(() => ({
  aria: {
    enabled: true,
    label: {
      description: `Treemap of the skills your saved jobs ask for, in ${props.byGroup.length} groups. The biggest group is ${[...props.byGroup].sort((a, b) => b.total - a.total)[0]?.group ?? 'none'}. Show as tables for the numbers.`,
    },
  },
  tooltip: { formatter: '{b}: {c}' },
  series: [
    {
      type: 'treemap',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Group names sit on the white band above each group, so they're dark
      upperLabel: { show: true, height: 22, color: '#111827', fontWeight: 'bold' },
      label: { show: true, color: '#ffffff', formatter: '{b}\n{c}' },
      itemStyle: { borderColor: '#ffffff', borderWidth: 1, gapWidth: 1 },
      levels: [{ itemStyle: { borderWidth: 3, gapWidth: 3 } }],
      data: props.byGroup.map((entry) => ({
        name: entry.group,
        value: entry.total,
        itemStyle: { color: groupColour(entry.group) },
        children: entry.skills.map((skill) => ({
          name: skill.name,
          value: skill.count,
          itemStyle: { color: groupColour(entry.group) },
        })),
      })),
    },
  ],
}));

const RADAR_COLOURS = ['#4f46e5', '#047857', '#b45309', '#be185d', '#0e7490', '#7c3aed', '#b91c1c'];

const radar = computed(() => {
  const max = Math.max(1, ...props.byCategory.categories.flatMap((category) => category.values));
  return {
    color: RADAR_COLOURS,
    aria: {
      enabled: true,
      decal: { show: true },
      label: {
        description: `Radar of skill groups by job category: ${props.byCategory.categories.map((category) => category.name).join(', ')}. Show as tables for the numbers.`,
      },
    },
    tooltip: {},
    legend: { bottom: 0, type: 'scroll', textStyle: { color: '#374151' } },
    radar: {
      radius: '50%',
      center: ['50%', '45%'],
      indicator: props.byCategory.groups.map((name) => ({ name, max })),
      // Two-line names ("Cloud and / platforms") so they don't run off the edge on phones
      axisName: {
        color: '#374151',
        fontSize: 11,
        formatter: (name: string) => name.replace(' and ', '\nand '),
      },
    },
    series: [
      {
        type: 'radar',
        data: props.byCategory.categories.map((category) => ({
          name: category.name,
          value: category.values,
          areaStyle: { opacity: 0.2 },
        })),
      },
    ],
  };
});
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-2">
    <figure class="rounded-xl border bg-card p-4 shadow-sm">
      <figcaption class="mb-2 font-semibold">Skills in demand, by group</figcaption>
      <!-- vue-echarts' own .echarts style (height: 100%) beats Tailwind's layered
           utilities, so the height goes on a wrapper the chart fills -->
      <div class="h-96"><VChart :option="treemap" autoresize /></div>
    </figure>
    <figure class="rounded-xl border bg-card p-4 shadow-sm">
      <figcaption class="mb-2 font-semibold">Skill groups by job category</figcaption>
      <div class="h-96"><VChart :option="radar" autoresize /></div>
    </figure>
  </div>
</template>
