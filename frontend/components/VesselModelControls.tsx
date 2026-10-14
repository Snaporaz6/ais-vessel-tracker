"use client";
import { MapSetting } from "./MapUIProvider";
import { useLanguage } from "./LanguageProvider";
export default function VesselModelControls({
  enabled,
  shadows,
  onEnabled,
  onShadows,
}: {
  enabled: boolean;
  shadows: boolean;
  onEnabled: (value: boolean) => void;
  onShadows: (value: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <MapSetting>
      <div className="vessel-model-settings">
        <label title={t("Modelli indicativi a zoom ravvicinato")}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabled(event.target.checked)}
          />
          {t("Navi 3D")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={shadows}
            disabled={!enabled}
            onChange={(event) => onShadows(event.target.checked)}
          />
          {t("Ombre")}
        </label>
      </div>
    </MapSetting>
  );
}
