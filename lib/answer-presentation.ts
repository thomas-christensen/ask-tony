import type { StoredAnswerRecord } from "@/lib/answer-store";
import type { Widget } from "@/lib/widget-schema";

export interface AnswerPresentation {
  title: string;
  description: string;
  highlights: string[];
  metricLabel?: string;
  metricValue?: string;
  metricSubtitle?: string;
}

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 180;

export function buildAnswerPresentation(answer: StoredAnswerRecord): AnswerPresentation {
  try {
    const widget = answer.response?.widget;

    const title = truncateText(extractTitle(answer, widget), MAX_TITLE_LENGTH);
    const description = truncateText(extractDescription(answer, widget), MAX_DESCRIPTION_LENGTH);

    const highlights = extractHighlights(widget);
    const primaryMetric = extractPrimaryMetric(widget);
    const derivedMetric = widget
      ? primaryMetric ?? extractChartMetric(widget) ?? extractListMetric(widget)
      : primaryMetric;

    return {
      title,
      description,
      highlights,
      metricLabel: derivedMetric?.label ?? primaryMetric?.label,
      metricValue: derivedMetric?.value ?? primaryMetric?.value,
      metricSubtitle: derivedMetric?.subtitle,
    };
  } catch (error) {
    console.error("Error building answer presentation:", error);
    // Fallback presentation
    return {
      title: answer.query || "Generated Answer",
      description: answer.response?.textResponse || "An answer was generated for your question.",
      highlights: [],
    };
  }
}

function extractTitle(answer: StoredAnswerRecord, widget: Widget | undefined): string {
  if (!widget) {
    return answer.query;
  }

  const titleCandidates: unknown[] = [
    widget.data?.title,
    widget.config?.title,
    widget.data?.heading,
    widget.data?.name,
  ];

  for (const candidate of titleCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return answer.query;
}

function extractDescription(answer: StoredAnswerRecord, widget: Widget | undefined): string {
  if (!widget) {
    return answer.response.textResponse || "Generated answer";
  }

  const descriptionCandidates: unknown[] = [
    widget.data?.subtitle,
    widget.data?.description,
    widget.config?.subtitle,
    widget.config?.description,
    widget.data?.summary,
  ];

  for (const candidate of descriptionCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (answer.response.textResponse) {
    return answer.response.textResponse;
  }

  switch (widget.type) {
    case "metric-card": {
      const label = safeString(widget.data?.label);
      const value = formatValue(widget.data?.value, widget.data?.unit);
      if (label && value) {
        return `${label}: ${value}`;
      }
      break;
    }
    case "metric-grid": {
      const metrics = widget.data?.metrics;
      if (Array.isArray(metrics) && metrics.length > 0) {
        const firstMetric = metrics[0];
        const label = safeString(firstMetric?.label);
        const value = formatValue(firstMetric?.value, firstMetric?.unit);
        if (label && value) {
          return `${label}: ${value}`;
        }
      }
      break;
    }
    case "list": {
      const items = widget.data?.items;
      if (Array.isArray(items) && items.length > 0) {
        const firstItem = items[0];
        const title = safeString(firstItem?.title);
        const description = safeString(firstItem?.description) || safeString(firstItem?.value);
        if (title && description) {
          return `${title} - ${description}`;
        }
        if (title) {
          return title;
        }
      }
      break;
    }
    case "comparison": {
      const options = widget.data?.options;
      if (Array.isArray(options) && options.length > 0) {
        const optionNames = options
          .map((option) => safeString(option?.name))
          .filter((name): name is string => Boolean(name));
        if (optionNames.length > 0) {
          return `Comparison of ${optionNames.join(", ")}`;
        }
      }
      break;
    }
    case "chart": {
      const datasetTitle = safeString(widget.data?.title) || safeString(widget.config?.title);
      if (datasetTitle) {
        return datasetTitle;
      }
      break;
    }
  }

  return "Generated answer";
}

function extractHighlights(widget: Widget | undefined): string[] {
  if (!widget) return [];

  switch (widget.type) {
    case "metric-card": {
      const label = safeString(widget.data?.label);
      const value = formatValue(widget.data?.value, widget.data?.unit);
      const trend = safeString(widget.data?.trend);
      if (label && value) {
        const base = `${label}: ${value}`;
        return trend ? [base, `Trend: ${trend}`] : [base];
      }
      break;
    }
    case "metric-grid": {
      const metrics = widget.data?.metrics;
      if (Array.isArray(metrics)) {
        return metrics
          .slice(0, 3)
          .map((metric) => {
            const label = safeString(metric?.label);
            const value = formatValue(metric?.value, metric?.unit);
            if (label && value) {
              return `${label}: ${value}`;
            }
            return safeString(metric?.description) || null;
          })
          .filter((text): text is string => Boolean(text));
      }
      break;
    }
    case "list": {
      const items = widget.data?.items;
      if (Array.isArray(items)) {
        return items
          .slice(0, 3)
          .map((item) => {
            const title = safeString(item?.title);
            const value = safeString(item?.value);
            if (title && value) return `${title}: ${value}`;
            return title ?? safeString(item?.description) ?? null;
          })
          .filter((text): text is string => Boolean(text));
      }
      break;
    }
    case "comparison": {
      const options = widget.data?.options;
      if (Array.isArray(options)) {
        return options
          .slice(0, 3)
          .map((option) => safeString(option?.name))
          .filter((text): text is string => Boolean(text));
      }
      break;
    }
    case "timeline": {
      const events = widget.data?.events;
      if (Array.isArray(events)) {
        return events
          .slice(0, 3)
          .map((event) => {
            const title = safeString(event?.title);
            const date = safeString(event?.date);
            if (title && date) return `${date}: ${title}`;
            return title ?? date ?? null;
          })
          .filter((text): text is string => Boolean(text));
      }
      break;
    }
    case "chart": {
      const labels = Array.isArray(widget.data?.labels) ? widget.data.labels : [];
      const datasets = Array.isArray(widget.data?.datasets) ? widget.data.datasets : [];

      if (datasets.length > 0) {
        return datasets
          .slice(0, 3)
          .map((dataset: any) => {
            const name = safeString(dataset?.name);
            if (name) return `Dataset: ${name}`;
            return null;
          })
          .filter((text: any): text is string => Boolean(text));
      }

      if (labels.length > 0) {
        return labels.slice(0, 3).map((label: any) => `Data point: ${label}`);
      }
      break;
    }
  }

  return [];
}

function extractPrimaryMetric(widget: Widget | undefined): { label: string; value: string } | null {
  if (!widget) return null;

  if (widget.type === "metric-card") {
    const label = safeString(widget.data?.label);
    const value = formatValue(widget.data?.value, widget.data?.unit);
    if (label && value) {
      return { label, value };
    }
  }

  if (widget.type === "metric-grid" && Array.isArray(widget.data?.metrics)) {
    const primary = widget.data.metrics[0];
    const label = safeString(primary?.label);
    const value = formatValue(primary?.value, primary?.unit);
    if (label && value) {
      return { label, value };
    }
  }

  return null;
}

function extractChartMetric(widget: Widget): { label: string; value: string; subtitle?: string } | null {
  if (widget.type !== "chart" || !widget.data) return null;

  const data = widget.data;
  const title = safeString(data?.title) || safeString(widget.config?.title);
  const subtitle = safeString(data?.subtitle) || safeString(widget.config?.subtitle);

  // Prefer multi-series dataset with values
  if (Array.isArray(data.datasets) && data.datasets.length > 0) {
    const dataset = data.datasets.find((ds: any) => Array.isArray(ds?.values) && ds.values.length > 0);
    if (dataset) {
      const name = safeString(dataset.name) || title || "Value";
      const values = dataset.values;
      const lastValue = values[values.length - 1];
      const formatted = formatValue(lastValue);
      if (formatted) {
        const labels = Array.isArray(data.labels) ? data.labels : undefined;
        const lastLabel =
          Array.isArray(labels) && labels.length === values.length ? labels[labels.length - 1] : undefined;
        const label = lastLabel ? `${name} (${lastLabel})` : name;
        return {
          label,
          value: formatted,
          subtitle: subtitle || (lastLabel ? `Latest from ${lastLabel}` : undefined),
        };
      }
    }
  }

  // Fall back to single-series points
  const points = Array.isArray(data.points) ? data.points : [];
  if (points.length > 0) {
    const lastPoint = points[points.length - 1];
    const pointLabel = safeString(lastPoint?.label);
    const value = formatValue(lastPoint?.value ?? lastPoint?.y);
    if (value) {
      return {
        label: pointLabel || title || "Value",
        value,
        subtitle,
      };
    }
  }

  return null;
}

function extractListMetric(widget: Widget): { label: string; value: string; subtitle?: string } | null {
  if (widget.type !== "list" || !Array.isArray(widget.data?.items)) return null;

  for (const item of widget.data.items) {
    const title = safeString(item?.title);
    const value = safeString(item?.value) || safeString(item?.description);
    if (title && value) {
      return {
        label: title,
        value,
      };
    }
  }

  return null;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function safeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function formatValue(value: unknown, unit?: unknown): string | null {
  if (value === null || value === undefined) return null;

  let text: string;
  if (typeof value === "number") {
    text = value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    text = String(value);
  }

  if (text.length === 0) return null;

  const unitText = safeString(unit);
  return unitText ? `${text} ${unitText}` : text;
}

