import type { FC } from "react";
import { createPortal } from "react-dom";
import type { CameraFlightState } from "../../domain/astro/cameraFlight";

interface CameraFlightStatusProps {
  flight: CameraFlightState | null;
  onCancel: () => void;
}

const CameraFlightStatus: FC<CameraFlightStatusProps> = ({ flight, onCancel }) => {
  if (!flight) return null;
  const status = (
    <div
      className={`camera-flight-status camera-flight-status--${flight.surface}`}
      data-camera-flight={flight.surface}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="camera-flight-status__signal" aria-hidden="true" />
      <span className="camera-flight-status__copy">
        <strong>{flight.label}</strong>
        <small>Drag, tap or press Esc to cancel</small>
      </span>
      <button type="button" className="camera-flight-status__cancel" onClick={onCancel}>
        Cancel flight
      </button>
    </div>
  );

  return flight.surface === "solar" && typeof document !== "undefined"
    ? createPortal(status, document.body)
    : status;
};

export default CameraFlightStatus;
