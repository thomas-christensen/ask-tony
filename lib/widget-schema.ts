/**
 * Widget Schema Types
 * 
 * Defines the structure for all widget types in the generative UI system.
 * These types are used for both TypeScript validation and Zod schema validation.
 */

export type WidgetType = 
  | 'metric-card'      // Single stat with trend
  | 'metric-grid'      // Multiple stats in grid
  | 'list'             // Vertical list with icons
  | 'comparison'       // Side-by-side comparison
  | 'chart'            // Line/bar/area/pie/radial charts
  | 'timeline'         // Chronological events
  | 'form'             // Interactive inputs
  | 'gallery'          // Image/media grid
  | 'profile'          // Person/entity card
  | 'container'        // Tabs/accordion/card wrapper
  | 'quote'            // Quote block with author
  | 'recipe'           // Recipe with ingredients/steps
  | 'weather'          // Weather card with conditions
  | 'stock-ticker';    // Stock price ticker

export type InteractionType = 'hover' | 'click' | 'slider' | 'toggle' | 'filter' | 'sort';

export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'radial';

export type ContainerVariant = 'tabs' | 'accordion' | 'card' | 'card-with-sections';

export interface Interaction {
  type: InteractionType;
  target?: string;
  effect: string;
}

export interface BaseWidget {
  type: WidgetType;
  config?: Record<string, any>;
  data?: any;
  interactions?: Interaction[];
  updateInterval?: number; // Milliseconds between auto-refreshes (min 5000)
  lastUpdated?: string; // ISO timestamp of last data update
}

export interface Widget extends BaseWidget {
  children?: Widget[];
}

// Specific widget config types

export interface MetricCardConfig {
  showTrend?: boolean;
  showComparison?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface MetricCardData {
  title?: string;
  subtitle?: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  description?: string;
  icon?: string;
}

export interface MetricGridConfig {
  columns?: number;
  size?: 'sm' | 'md' | 'lg';
}

export interface MetricGridData {
  title?: string;
  subtitle?: string;
  metrics: MetricCardData[];
}

export interface ListConfig {
  showIcons?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
}

export interface ListItem {
  title: string;
  description?: string;
  icon?: string;
  badge?: string;
  value?: string;
}

export interface ListData {
  title?: string;
  subtitle?: string;
  items: ListItem[];
}

export interface ComparisonConfig {
  variant?: 'table' | 'cards';
  highlightDifferences?: boolean;
}

export interface ComparisonOption {
  name: string;
  features: Record<string, string | number | boolean>;
  highlighted?: boolean;
}

export interface ComparisonData {
  title?: string;
  subtitle?: string;
  options: ComparisonOption[];
}

export interface ChartConfig {
  chartType: ChartType;
  showLegend?: boolean;
  showGrid?: boolean;
  colors?: string[];
  title?: string;
}

export interface ChartDataPoint {
  label?: string;
  value: number;
  date?: string;
  x?: string | number;
  y?: number;
}

export interface ChartData {
  points?: ChartDataPoint[];
  labels?: string[];
  datasets?: {
    name: string;
    values: number[];
    color?: string;
  }[];
}

export interface TimelineConfig {
  variant?: 'default' | 'compact';
  showIcons?: boolean;
}

export interface TimelineEvent {
  title: string;
  date: string;
  description?: string;
  icon?: string;
  status?: 'completed' | 'current' | 'upcoming';
}

export interface TimelineData {
  events: TimelineEvent[];
}

export interface FormConfig {
  formType?: 'calculator' | 'converter' | 'input';
  submitLabel?: string;
}

export interface FormField {
  name: string;
  label: string;
  type: 'number' | 'text' | 'slider' | 'toggle' | 'select';
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface FormData {
  title?: string;
  subtitle?: string;
  fields: FormField[];
  calculation?: string;
  resultLabel?: string;
  resultPrefix?: string;
  resultSuffix?: string;
  resultDecimals?: number;
  resultDescription?: string;
}

export interface GalleryConfig {
  columns?: number;
  variant?: 'grid' | 'masonry';
  clickable?: boolean;
}

export interface GalleryItem {
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
}

export interface GalleryData {
  title?: string;
  subtitle?: string;
  items: GalleryItem[];
}

export interface ProfileConfig {
  variant?: 'default' | 'card' | 'detailed';
  showSocial?: boolean;
}

export interface ProfileData {
  name: string;
  title?: string;
  description?: string;
  avatar?: string;
  stats?: Record<string, string | number>;
  links?: { label: string; url: string }[];
}

export interface ContainerConfig {
  variant: ContainerVariant;
  labels?: string[];
  defaultExpanded?: boolean;
}

// Quote widget types

export interface QuoteConfig {
  variant?: 'default' | 'emphasized' | 'minimal';
  size?: 'sm' | 'md' | 'lg';
  theme?: 'default' | 'dark';
}

export interface QuoteData {
  quote: string;
  author: string;
  title?: string;
  context?: string;
}

// Recipe widget types

export interface RecipeConfig {
  layout?: 'modern' | 'classic';
  showTimings?: boolean;
  showDifficulty?: boolean;
}

export interface RecipeData {
  title: string;
  subtitle?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: number;
  difficulty?: string;
  ingredients: string[];
  steps: string[];
  image?: string;
}

// Weather widget types

export interface WeatherConfig {
  variant?: 'current' | 'detailed' | 'forecast';
  units?: 'celsius' | 'fahrenheit';
  theme?: 'default' | 'vibrant';
}

export interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  icon?: string;
  humidity?: number;
  wind?: string;
  forecast?: Array<{ day: string; temp: number; condition: string }>;
}

// Stock ticker widget types

export interface StockTickerConfig {
  variant?: 'compact' | 'detailed';
  showSparkline?: boolean;
}

export interface StockTickerData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  history?: Array<{ date: string; price: number }>;
  volume?: number;
}

// Widget response types

export interface WidgetResponse {
  widget?: Widget;
  source?: string | null;
  error?: boolean;
  textResponse?: string;
}

export interface PlanResult {
  widgetType: WidgetType;
  dataSource: 'mock-database' | 'web-search' | 'example-data';
  searchQuery?: string | null;
  queryIntent?: string | null;
  dataStructure: 'single-value' | 'list' | 'comparison' | 'timeseries' | 'grid';
  keyEntities: string[];
  reasoning?: string;
}

export interface DataResult {
  data: any;
  source: string | null;
  confidence: 'high' | 'medium' | 'low';
}

