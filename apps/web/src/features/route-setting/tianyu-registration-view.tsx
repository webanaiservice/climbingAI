"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { tianyuRegistrationLabels, tianyuRegistrationStatus, type TianyuHold, type TianyuRegistrationReport } from "./tianyu-board";
import { Button } from "./ui/button";

export function TianyuRegistrationSummary({ report, holds }: { report: TianyuRegistrationReport; holds: TianyuHold[] }) {
  const counts = holds.reduce<Record<string, number>>((result, point) => {
    const status = tianyuRegistrationStatus(point);
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
  return <div className="tianyu-registration-summary">
    <strong>照片 / GLB 配准</strong>
    <span>已配准 {counts.registered ?? 0} · 待复核 {counts.uncertain ?? 0} · 扫描未覆盖 {counts.missing ?? 0}</span>
    {Boolean(counts.moved || counts.unregistered) && <span>移动或新增待关联 {(counts.moved ?? 0) + (counts.unregistered ?? 0)}</span>}
    <small>稀疏模型 {report.validation.holdoutCount} 个留出检查点 · 中位 {report.validation.holdoutErrorPx.median.toFixed(1)} px · 95% ≤ {report.validation.holdoutErrorPx.p95.toFixed(1)} px</small>
    <small>这是图像对齐误差，不等于实物测量精度。未覆盖点仍可按照片选线。</small>
  </div>;
}

export function TianyuRegistrationInspector({ point, report }: { point: TianyuHold; report: TianyuRegistrationReport | null }) {
  const [showModel, setShowModel] = useState(false);
  const status = tianyuRegistrationStatus(point);
  const registration = point.registration;
  const hasSurface = (status === "registered" || status === "uncertain") && registration?.surfacePoint && report;
  return <div className={`tianyu-registration-inspector status-${status}`}>
    <strong>{tianyuRegistrationLabels[status]}</strong>
    <span>{status === "moved" ? "照片点位已保留。原三维位置不再用于此点，避免移动后继续引用旧关联。"
      : registration?.reason ?? "此点保留照片坐标和人工属性，仍可用于定线。"}</span>
    {hasSurface && <>
      <small>{registration.localCheckCount} 个附近分区验证特征{registration.localCheckP90Px !== null ? ` · P90 ${registration.localCheckP90Px.toFixed(1)} px` : ""}</small>
      {registration.bidirectionalErrorPx !== undefined && <small>本点正反向对齐差 {registration.bidirectionalErrorPx.toFixed(1)} px{registration.patchCheck ? ` · 局部纹理残差 ${registration.patchCheck.offsetPx.toFixed(1)} px` : ""}</small>}
      <Button size="sm" variant="outline" onClick={() => setShowModel((value) => !value)}>{showModel ? "收起三维对照" : "查看此点三维对应"}</Button>
      {showModel && <TianyuSurfacePreview point={point} meshUrl={report.source.meshUrl} />}
    </>}
  </div>;
}

type ModelViewer = HTMLElement & { updateHotspot: (config: { name: string; position: string; normal: string }) => void };

function TianyuSurfacePreview({ point, meshUrl }: { point: TianyuHold; meshUrl: string }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const viewer = useRef<ModelViewer | null>(null);
  const position = point.registration!.surfacePoint!.map((n) => `${n}m`).join(" ");
  const normal = point.registration!.surfaceNormal!.join(" ");
  useEffect(() => {
    let active = true;
    void import("@google/model-viewer").then(() => { if (active) setReady(true); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ready) viewer.current?.updateHotspot({ name: "hotspot-selected", position, normal });
  }, [ready, position, normal]);
  if (error) return <span>三维预览未能加载，照片与配准记录仍可查看。</span>;
  if (!ready) return <span role="status">正在加载三维对照…</span>;
  return <div className="tianyu-surface-preview">
    {createElement("model-viewer", {
      ref: viewer, src: meshUrl, alt: `${point.serial} 对应的原始 GLB 表面`,
      className: "tianyu-model-viewer", "camera-controls": "", "interaction-prompt": "none",
      "camera-target": position, "camera-orbit": "0deg 90deg 1.8m", "min-camera-orbit": "auto auto 0.15m", "max-camera-orbit": "auto auto 12m", "field-of-view": "35deg", exposure: "1", onError: () => setError(true),
    }, createElement("button", { slot: "hotspot-selected", "data-position": position, "data-normal": normal, className: "tianyu-model-marker", type: "button" }, point.serial))}
    <small>拖动旋转 / 滚轮缩放。显示原始扫描和关联位置；网格未补画，表面凸起不等于有效抓深。</small>
  </div>;
}
