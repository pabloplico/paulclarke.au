import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { LanguageModel } from 'ai';
import { apiFetcherTool } from '@/lib/agents/mastra/tools/api-fetcher';
import { createDbWriterTool } from '@/lib/agents/mastra/tools/db-writer';
import { fileParserTool } from '@/lib/agents/mastra/tools/file-parser';
import { createScraperTool } from '@/lib/agents/mastra/tools/scraper';
import { createSourceScorerTool } from '@/lib/agents/mastra/tools/source-scorer';
import { webSearchTool } from '@/lib/agents/mastra/tools/web-search';

interface AgentContext {
  userId: number;
  workspaceId: number;
  agentRunId?: number;
}

/**
 * Cast the AI SDK v6 LanguageModel union to MastraModelConfig for Mastra compatibility.
 * AI SDK v6 LanguageModel is a union of LanguageModelV3 | LanguageModelV2 | string,
 * which doesn't directly satisfy Mastra's DynamicArgument<MastraModelConfig> constraint.
 * At runtime the providers return LanguageModelV3 objects, so this cast is safe.
 */
function toMastraModel(model: LanguageModel): MastraModelConfig {
  return model as unknown as MastraModelConfig;
}

/**
 * Create agent instances with a specific model and security context.
 * userId/workspaceId are baked into the db-writer tool to prevent LLM manipulation.
 */
export function createResearchAgent(model: LanguageModel, ctx: AgentContext) {
  return new Agent({
    id: 'research-agent',
    name: 'Market Research Specialist',
    model: toMastraModel(model),
    instructions: `You are an expert market research specialist. Your job is to find high-quality data about specific markets.

When given a research task:
1. Use web-search to find relevant articles, reports, and data sources
2. Use scraper to extract detailed content from promising URLs
3. Use api-fetcher to query public data APIs (GDELT for news, NewsAPI for articles, World Bank for economic data)
4. For each distinct finding, use save-finding to persist it to the database
5. Score confidence based on source authority: paid feeds (0.9), public APIs (0.75), web scrapes (0.5)
6. Extract geographic information when available (country, state, city)
7. Tag findings with relevant sectors, topics, and entities

Focus on credible sources. Save every distinct finding — even small data points are valuable in aggregate.`,
    tools: {
      webSearch: webSearchTool,
      scraper: createScraperTool({ userId: ctx.userId, workspaceId: ctx.workspaceId }),
      apiFetcher: apiFetcherTool,
      saveFinding: createDbWriterTool(ctx),
      scoreSource: createSourceScorerTool({ userId: ctx.userId, workspaceId: ctx.workspaceId }),
    },
  });
}

export function createIngestionAgent(model: LanguageModel, ctx: AgentContext) {
  return new Agent({
    id: 'ingestion-agent',
    name: 'Data Ingestion Specialist',
    model: toMastraModel(model),
    instructions: `You are a data ingestion specialist. Extract structured market research findings from uploaded documents.

When given a file to process:
1. Use file-parser to extract text content from the PDF or CSV
2. Analyze the content and identify distinct findings
3. For each finding, classify its type (trend, competitor, pricing, regulation, sentiment, statistic, news)
4. Assess confidence based on the source quality
5. Extract any geographic information
6. Save each finding using save-finding

Be thorough — extract every distinct data point, statistic, or insight from the document.`,
    tools: {
      parseFile: fileParserTool,
      saveFinding: createDbWriterTool(ctx),
    },
  });
}

export function createAnalysisAgent(model: LanguageModel) {
  return new Agent({
    id: 'analysis-agent',
    name: 'Market Analysis Specialist',
    model: toMastraModel(model),
    instructions: `You are a market analysis specialist. Synthesize research findings into structured reports.

When given a set of findings:
1. Group findings by type and theme
2. Identify key trends and patterns
3. Assess competitive landscape
4. Note regulatory considerations
5. Provide actionable recommendations
6. Generate an executive summary

Structure your output as a report with clear sections: Executive Summary, Key Trends, Competitive Landscape, Geographic Insights, Regulatory Environment, and Recommendations.`,
  });
}
