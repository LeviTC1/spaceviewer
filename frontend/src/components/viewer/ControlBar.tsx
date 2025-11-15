import type { FC } from "react";

interface ControlBarProps {
  onHighlight: () => void;
  imageUrl: string;
  fullResUrl?: string;
  archiveUrl?: string;
  analysisLoading: boolean;
  analysisActive: boolean;
  nasaId?: string;
}

const ControlBar: FC<ControlBarProps> = ({
  onHighlight,
  imageUrl,
  fullResUrl,
  archiveUrl,
  analysisLoading,
  analysisActive,
  nasaId,
}) => {
  const handleDownload = async () => {
    if (!fullResUrl) {
      window.open(imageUrl, "_blank");
      return;
    }

    try {
      const response = await fetch(fullResUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const extension = fullResUrl.includes(".png") ? "png" : "jpg";
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `spaceviewer-${Date.now()}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed", error);
      window.open(fullResUrl, "_blank");
    }
  };

  const handleArchive = () => {
    if (nasaId) {
      window.open(`https://images.nasa.gov/details/${nasaId}`, "_blank");
    } else if (archiveUrl) {
      window.open(archiveUrl, "_blank");
    }
  };

  return (
    <div className="control-bar">
      <button type="button" onClick={onHighlight} disabled={analysisLoading} className={analysisActive ? "active" : ""}>
        Highlight Objects
      </button>
      <button type="button" className="ghost" onClick={handleDownload}>
        Download
      </button>
      <button type="button" className="ghost" onClick={handleArchive} disabled={!nasaId && !archiveUrl}>
        Open in archive
      </button>
    </div>
  );
};

export default ControlBar;
