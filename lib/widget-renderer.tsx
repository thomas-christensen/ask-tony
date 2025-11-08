import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Markdown } from '@/components/markdown';
import type { Widget, WidgetResponse, ContainerConfig } from './widget-schema';
import { MetricCard, MetricGrid } from '@/components/widgets/metric-card';
import { ListWidget } from '@/components/widgets/list-widget';
import { ComparisonWidget } from '@/components/widgets/comparison-widget';
import { FormWidget } from '@/components/widgets/form-widget';
import { ContainerWidget } from '@/components/widgets/container-widget';

// Import existing components for backwards compatibility
import { LineChart } from '@/components/line-chart';
import { BarChart } from '@/components/bar-chart';
import { PieChart } from '@/components/pie-chart';
import { AreaChart } from '@/components/area-chart';
import { RadialChart } from '@/components/radial-chart';
import { TimelineView } from '@/components/timeline-view';
import { MediaGrid } from '@/components/media-grid';
import { ImageGallery } from '@/components/image-gallery';
import { ProfileCard } from '@/components/profile-card';
import { QuoteBlock } from '@/components/quote-block';
import { RecipeCard } from '@/components/recipe-card';
import { WeatherCard } from '@/components/weather-card';
import { StockTicker } from '@/components/stock-ticker';

/**
 * Renders a widget based on its type
 * This is the core rendering function that maps widget JSON to React components
 */
export function renderWidget(widget: Widget): ReactNode {
  try {
    switch (widget.type) {
      case 'metric-card':
        if (!widget.data) return <ErrorWidget message="Metric card requires data" />;
        return <MetricCard data={widget.data} interactions={widget.interactions} />;

      case 'metric-grid':
        if (!widget.data?.metrics) return <ErrorWidget message="Metric grid requires metrics data" />;
        return <MetricGrid data={widget.data} interactions={widget.interactions} />;

      case 'list':
        if (!widget.data?.items) return <ErrorWidget message="List requires items data" />;
        return <ListWidget data={widget.data} interactions={widget.interactions} />;

      case 'comparison':
        if (!widget.data?.options) return <ErrorWidget message="Comparison requires options data" />;
        return (
          <ComparisonWidget
            data={widget.data}
            config={widget.config}
            interactions={widget.interactions}
          />
        );

      case 'chart':
        return renderChart(widget);

      case 'timeline':
        if (Array.isArray(widget.data?.events) && widget.data.events.length > 0) {
          return <TimelineView data={widget.data.events} config={widget.config} />;
        }
        return <ErrorWidget message="Timeline requires events data" />;

      case 'form':
        if (!widget.data?.fields) return <ErrorWidget message="Form requires fields data" />;
        return <FormWidget data={widget.data} config={widget.config} />;

      case 'gallery':
        if (Array.isArray(widget.data?.items) && widget.data.items.length > 0) {
          // Check if items have url property (image gallery) or different structure (media grid)
          const hasUrls = widget.data.items.every((item: any) => item.url);
          if (hasUrls) {
            return <ImageGallery images={widget.data.items} />;
          }
          return <MediaGrid data={widget.data.items} config={widget.config} />;
        }
        return <ErrorWidget message="Gallery requires items data" />;

      case 'profile':
        if (widget.data?.name) {
          return <ProfileCard data={widget.data} config={widget.config} />;
        }
        return <ErrorWidget message="Profile requires name data" />;

      case 'container':
        if (!widget.config?.variant) return <ErrorWidget message="Container requires variant config" />;
        if (!Array.isArray(widget.children) || widget.children.length === 0) {
          return <ErrorWidget message="Container requires children widgets" />;
        }
        return (
          <ContainerWidget
            config={widget.config as ContainerConfig}
            children={widget.children}
            renderWidget={renderWidget}
          />
        );

      case 'quote':
        if (!widget.data?.quote || !widget.data?.author) {
          return <ErrorWidget message="Quote requires quote text and author" />;
        }
        return <QuoteBlock data={widget.data} config={widget.config} />;

      case 'recipe':
        if (!widget.data?.title || !widget.data?.ingredients || !widget.data?.steps) {
          return <ErrorWidget message="Recipe requires title, ingredients, and steps" />;
        }
        return <RecipeCard data={widget.data} config={widget.config} />;

      case 'weather':
        if (!widget.data?.location || widget.data?.temperature === undefined) {
          return <ErrorWidget message="Weather requires location and temperature" />;
        }
        return <WeatherCard data={widget.data} config={widget.config} />;

      case 'stock-ticker':
        if (!widget.data?.symbol || widget.data?.price === undefined) {
          return <ErrorWidget message="Stock ticker requires symbol and price" />;
        }
        return <StockTicker data={widget.data} config={widget.config} />;

      default:
        return <ErrorWidget message={`Unknown widget type: ${widget.type}`} />;
    }
  } catch (error) {
    console.error('Widget rendering error:', error);
    return <ErrorWidget message={`Failed to render ${widget.type}: ${(error as Error).message}`} />;
  }
}

/**
 * Renders chart widgets based on chartType config
 */
function renderChart(widget: Widget): ReactNode {
  const chartType = widget.config?.chartType || 'line';
  const data = widget.data;

  if (!data) {
    return <ErrorWidget message="Chart requires data" />;
  }

  // Check if we have multi-dataset format (labels + datasets)
  // If so, pass the whole data object; otherwise extract points/datasets
  let chartData;
  if (data.labels && data.datasets) {
    // Multi-dataset format - pass entire data object with labels and datasets
    chartData = data;
  } else {
    // Single dataset or simple array format
    chartData = data.points || data.datasets || data;
  }

  // Validate we have data to render
  if (!chartData || (Array.isArray(chartData) && chartData.length === 0)) {
    return <ErrorWidget message="Chart requires data points" />;
  }

  // Pass widget.data along with config so charts can access title/subtitle
  const chartConfig = {
    ...widget.config,
    title: widget.config?.title || data.title,
    subtitle: widget.config?.subtitle || data.subtitle,
  };

  switch (chartType) {
    case 'line':
      return <LineChart data={chartData} config={chartConfig} />;
    case 'bar':
      return <BarChart data={chartData} config={chartConfig} />;
    case 'area':
      return <AreaChart data={chartData} config={chartConfig} />;
    case 'pie':
      return <PieChart data={chartData} config={chartConfig} />;
    case 'radial':
      return <RadialChart data={chartData} config={chartConfig} />;
    default:
      return <ErrorWidget message={`Unknown chart type: ${chartType}`} />;
  }
}

/**
 * Helper to get data source badge info
 */
function getDataSourceBadge(source: string | null | undefined, plan?: any): { label: string; emoji: string; color: string } | null {
  const dataSource = plan?.dataSource || source;

  if (dataSource === 'mock-database' || source === 'mock-database') {
    return { label: 'Database', emoji: '📊', color: 'text-blue-600 dark:text-blue-400' };
  } else if (dataSource === 'web-search') {
    return { label: 'Web Search', emoji: '🌐', color: 'text-green-600 dark:text-green-400' };
  } else if (dataSource === 'example-data') {
    return { label: 'Example Data', emoji: '📝', color: 'text-purple-600 dark:text-purple-400' };
  }

  return null;
}

export function renderWidgetResponse(
  response: WidgetResponse,
  plan?: any,
  query?: string,
  dataMode?: 'web-search' | 'example-data'
): ReactNode {
  // Handle errors
  if (response.error || response.textResponse) {
    return (
      <div className="text-foreground">
        <Markdown>{response.textResponse || 'An error occurred'}</Markdown>
      </div>
    );
  }

  // Render widget wrapped in card
  if (response.widget) {
    const badge = getDataSourceBadge(response.source, plan);
    const queryIntent = plan?.queryIntent;
    const showMetadata = badge || queryIntent;

    return (
      <div className="md:max-w-[500px] max-w-[calc(100dvw-80px)] w-full">
        <Card className="overflow-hidden">
          {renderWidgetWithLiveSupport(response.widget, plan, query, dataMode)}
          {showMetadata && (
            <div className="px-4 py-2 border-t border-border/40 bg-muted/30">
              {badge && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium">{badge.label}</span>
                  {queryIntent && (
                    <span className="text-[11px] text-muted-foreground">
                      {queryIntent}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="text-foreground">
      <Markdown>No content to display</Markdown>
    </div>
  );
}

/**
 * Renders a widget with optional live update support
 * Wraps in LiveWidgetWrapper if widget has updateInterval
 */
function renderWidgetWithLiveSupport(
  widget: Widget,
  plan?: any,
  query?: string,
  dataMode?: 'web-search' | 'example-data'
): ReactNode {
  // Check if widget should have live updates
  if (widget.updateInterval && widget.updateInterval >= 5000 && plan && query) {
    // Lazy import to avoid circular dependency
    const { LiveWidgetWrapper } = require('@/components/live-widget-wrapper');
    
    return (
      <LiveWidgetWrapper
        widget={widget}
        plan={plan}
        query={query}
        dataMode={dataMode}
        renderWidget={renderWidget}
      />
    );
  }
  
  // No live updates - render normally
  return renderWidget(widget);
}

/**
 * Simple error widget for displaying validation/rendering errors
 */
function ErrorWidget({ message }: { message: string }) {
  return (
    <div className="w-full p-6">
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-sm text-red-800 dark:text-red-200">
          {message}
        </p>
      </div>
    </div>
  );
}

