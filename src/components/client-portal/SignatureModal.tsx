import { useRef, useEffect, useState } from "react";
import SignaturePad from "signature_pad";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eraser, PenLine } from "lucide-react";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: (signatureData: string, signerName: string) => void;
  agreementTitle: string;
  isLoading?: boolean;
}

export function SignatureModal({ isOpen, onClose, onSign, agreementTitle, isLoading }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);

      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(0, 0, 0)",
      });
    }

    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.clear();
      }
    };
  }, [isOpen]);

  const handleClear = () => {
    signaturePadRef.current?.clear();
  };

  const handleSign = () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      return;
    }
    if (!signerName.trim()) {
      return;
    }
    if (!agreed) {
      return;
    }

    const signatureData = signaturePadRef.current.toDataURL("image/png");
    onSign(signatureData, signerName);
  };

  const handleClose = () => {
    setSignerName("");
    setAgreed(false);
    signaturePadRef.current?.clear();
    onClose();
  };

  const isValid = signerName.trim() && agreed && signaturePadRef.current && !signaturePadRef.current.isEmpty();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Sign Agreement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            You are signing: <span className="font-medium text-foreground">{agreementTitle}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signerName">Full Legal Name *</Label>
            <Input
              id="signerName"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full legal name"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Signature *</Label>
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                <Eraser className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                className="w-full h-[150px] cursor-crosshair touch-none"
                style={{ touchAction: "none" }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use your mouse or finger to draw your signature above
            </p>
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="agreement"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <label
              htmlFor="agreement"
              className="text-sm leading-tight cursor-pointer"
            >
              I agree that this electronic signature is legally binding and equivalent to my handwritten signature.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSign}
            disabled={isLoading || !signerName.trim() || !agreed}
          >
            {isLoading ? "Signing..." : "Sign Agreement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
