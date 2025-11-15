import { useState } from "react";
import { useState, useCallback } from "react";
import { fetchImage, type ImageResult } from "../utils/api";

const useImageData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<ImageResult | null>(null);

  const loadImage = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchImage(id);
      if (!data.success) {
        setError("Failed to load image.");
        setImageData(null);
      } else {
        setImageData(data);
      }
      return data;
    } catch (caughtError) {
      console.error("loadImage error", caughtError);
      setError("Image request failed.");
      setImageData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, imageData, loadImage };
};

export default useImageData;
