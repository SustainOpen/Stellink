import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  linkUrl: string;
  amount: string;
  tokenType: string;
}

const QrModal: React.FC<QrModalProps> = ({ isOpen, onClose, linkUrl, amount, tokenType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      // Generar QR de alta resolución (1024px) como pide el issue
      QRCode.toCanvas(canvasRef.current, linkUrl, {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: 'Q', // Nivel Q solicitado
      }, (error) => {
        if (error) console.error(error);
      });
    }
  }, [isOpen, linkUrl]);

  if (!isOpen) return null;

  const downloadPNG = () => {
    if (canvasRef.current) {
      const pngUrl = canvasRef.current.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `Stellink-QR-${amount}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
        <h3 className="text-lg font-bold mb-2">Código de Pago</h3>
        <p className="text-gray-600 mb-4">{amount} {tokenType}</p>
        
        {/* El canvas se mantiene oculto o pequeño visualmente, pero se genera a 1024px internamente */}
        <div className="flex justify-center mb-4">
          <canvas ref={canvasRef} className="w-48 h-48 border rounded-lg" />
        </div>

        <div className="flex flex-col gap-2">
          <button 
            onClick={downloadPNG}
            className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Descargar PNG
          </button>
          <button 
            onClick={onClose}
            className="text-gray-500 py-2 hover:underline"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default QrModal;