'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n/provider';
import { tError } from '@/lib/i18n';
import type { Dictionary } from '@/lib/i18n';
import { parseFoodFromPhoto, type ParsedMealPhoto } from '@/app/actions/parseFoodFromPhoto';
import { saveDietLog } from '@/app/actions/saveDietLog';
import { updateDietLog } from '@/app/actions/updateDietLog';
import { useMealPhoto } from './meal-photo-context';
import type { DietLogItem } from '@/app/actions/types';

/**
 * Strips transient parse-only fields (confidence, notes) so they don't end
 * up serialized into the diet_logs JSON column. Saving and updating both
 * persist exactly the DietLogItem shape — confidence is a UI signal only.
 */
function toDietLogItem(parsed: ParsedMealPhoto, loggedAt: string): DietLogItem {
  return {
    id: parsed.id,
    food_name: parsed.food_name,
    calories: parsed.calories,
    protein: parsed.protein,
    carbs: parsed.carbs,
    fat: parsed.fat,
    logged_at: loggedAt,
  };
}

type Props = {
  userId: string;
  onSuccess?: () => void;
};

/**
 * Confidence floor for the auto-save fast path. Above this the entry is
 * persisted immediately and the user can optionally tap "调整" to edit;
 * below it the user must confirm before anything is written.
 */
const HIGH_CONFIDENCE_THRESHOLD = 0.75;

type EditState = {
  parsed: ParsedMealPhoto;
  previewUrl: string;
  /**
   * Present only when the entry was already auto-saved (high-confidence path)
   * and we are now editing it in place. Undefined means the user is reviewing
   * an unsaved low-confidence parse — save creates a new row.
   */
  savedLogId?: string;
};

async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.85
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image compression failed'))),
      'image/jpeg',
      quality
    );
  });
}

function ConfidenceBadge({ value, t }: { value: number; t: Dictionary }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.75
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
      : value >= 0.5
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {t.logForm.photo.aiConfidence(pct)}
    </span>
  );
}

/**
 * Meal-photo FAB with the "async parse + smart preview" flow:
 *
 *   FAB click → file picker
 *     ↓ (immediate, no dialog)
 *   Loading toast "正在识别…"
 *     ↓ background parse via Gemini
 *   ┌─ confidence ≥ 0.75 → auto-save → "已记录" toast w/ "调整" action
 *   └─ confidence  < 0.75 → "请确认" toast w/ "审核" action → opens dialog
 *
 * The dialog only mounts when the user opts in (low-conf review or high-conf
 * "调整"), so the happy path is fully background and zero-wait.
 */
export function MealPhotoUpload({ userId, onSuccess }: Props) {
  const t = useT();
  const { registerOpener } = useMealPhoto();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [edited, setEdited] = useState<
    Pick<ParsedMealPhoto, 'food_name' | 'calories' | 'protein' | 'carbs' | 'fat'> | null
  >(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const openReview = useCallback(
    (parsed: ParsedMealPhoto, previewUrl: string, savedLogId?: string) => {
      setEditing({ parsed, previewUrl, savedLogId });
      setEdited({
        food_name: parsed.food_name,
        calories: parsed.calories,
        protein: parsed.protein,
        carbs: parsed.carbs,
        fat: parsed.fat,
      });
    },
    []
  );

  const closeReview = useCallback(() => {
    if (editing) URL.revokeObjectURL(editing.previewUrl);
    setEditing(null);
    setEdited(null);
    setSaving(false);
  }, [editing]);

  /**
   * Background pipeline. Owns the loading toast lifecycle and the object-URL
   * for the preview image. Only opens the review dialog when the user must
   * intervene (low-confidence parse) or actively asks to edit a saved entry.
   */
  const processPhoto = useCallback(
    async (file: File) => {
      let objectUrl: string | null = null;
      const loading = toast({
        title: t.logForm.photo.recognizing,
        description: t.logForm.photo.recognizingDesc,
      });
      try {
        const compressed = await compressImage(file);
        objectUrl = URL.createObjectURL(compressed);

        const fd = new FormData();
        fd.append('photo', compressed, 'meal.jpg');
        const parseResult = await parseFoodFromPhoto(fd);

        if (!parseResult.success || !parseResult.data) {
          loading.dismiss();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          toast({
            title: t.logForm.photo.recognizeFailed,
            description: tError(t, parseResult.error),
            variant: 'destructive',
          });
          return;
        }

        const parsed = parseResult.data;

        // ── Low confidence: require explicit review before any DB write.
        if (parsed.confidence < HIGH_CONFIDENCE_THRESHOLD) {
          loading.dismiss();
          const previewUrl = objectUrl;
          objectUrl = null; // hand ownership to the dialog (revoked on close)
          toast({
            title: t.logForm.photo.confirmTitle,
            description: t.logForm.photo.confirmDesc(parsed.food_name, Math.round(parsed.confidence * 100)),
            action: (
              <ToastAction
                altText={t.logForm.photo.reviewAlt}
                onClick={() => openReview(parsed, previewUrl)}
              >
                {t.logForm.photo.review}
              </ToastAction>
            ),
          });
          return;
        }

        // ── High confidence: auto-save, then offer optional adjustment.
        const saveResult = await saveDietLog(
          toDietLogItem(parsed, new Date().toISOString())
        );
        loading.dismiss();

        if (!saveResult.success || !saveResult.data) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          toast({
            title: t.logForm.photo.saveFailed,
            description: tError(t, saveResult.error),
            variant: 'destructive',
          });
          return;
        }

        const savedItem = saveResult.data;
        const previewUrl = objectUrl;
        objectUrl = null;
        onSuccess?.();
        toast({
          title: t.logForm.photo.logged,
          description: t.logForm.photo.loggedDesc(savedItem.food_name, savedItem.calories),
          action: (
            <ToastAction
              altText={t.logForm.photo.adjustAlt}
              onClick={() =>
                openReview(
                  { ...parsed, ...savedItem, confidence: parsed.confidence, notes: parsed.notes },
                  previewUrl,
                  savedItem.id
                )
              }
            >
              {t.logForm.photo.adjust}
            </ToastAction>
          ),
        });
      } catch (err) {
        console.error('[MealPhotoUpload] processPhoto failed:', err);
        loading.dismiss();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        toast({
          title: t.logForm.photo.processFailed,
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      }
    },
    [toast, userId, onSuccess, openReview, t]
  );

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so picking the same file twice still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!file) return;
      void processPhoto(file);
    },
    [processPhoto]
  );

  // Expose the picker to the unified action dock instead of a standalone FAB.
  useEffect(() => {
    registerOpener(() => fileInputRef.current?.click());
    return () => registerOpener(null);
  }, [registerOpener]);

  const onSave = useCallback(async () => {
    if (!editing || !edited) return;
    setSaving(true);

    const isUpdate = !!editing.savedLogId;
    const next: DietLogItem = {
      id: editing.savedLogId ?? editing.parsed.id,
      food_name: edited.food_name,
      calories: edited.calories,
      protein: edited.protein,
      carbs: edited.carbs,
      fat: edited.fat,
      logged_at: isUpdate ? editing.parsed.logged_at : new Date().toISOString(),
    };

    const result = isUpdate
      ? await updateDietLog(editing.savedLogId!, next)
      : await saveDietLog(next);

    if (!result.success) {
      setSaving(false);
      toast({
        title: isUpdate ? t.logForm.photo.updateFailed : t.logForm.photo.saveFailed,
        description: tError(t, result.error),
        variant: 'destructive',
      });
      return;
    }

    onSuccess?.();
    toast({
      title: isUpdate ? t.logForm.photo.updated : t.logForm.photo.logged,
      description: `${next.food_name} · ${next.calories} kcal`,
    });
    closeReview();
  }, [editing, edited, userId, onSuccess, toast, closeReview, t]);

  const setField = <K extends keyof NonNullable<typeof edited>>(
    key: K,
    value: NonNullable<typeof edited>[K]
  ) => {
    setEdited((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <>
      {/* Picker is triggered by the unified action dock via MealPhotoProvider. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileSelected}
        className="hidden"
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !saving) closeReview();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.savedLogId ? t.logForm.photo.adjustTitle : t.logForm.photo.confirmReviewTitle}
            </DialogTitle>
            <DialogDescription>
              {editing?.savedLogId
                ? t.logForm.photo.adjustedDesc
                : t.logForm.photo.lowConfDesc}
            </DialogDescription>
          </DialogHeader>

          {editing && edited && (
            <div className="space-y-4">
              {editing.previewUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={editing.previewUrl}
                  alt="meal preview"
                  className="max-h-48 w-full rounded-lg object-cover"
                />
              )}

              <div className="flex items-center justify-between gap-2">
                <ConfidenceBadge value={editing.parsed.confidence} t={t} />
                {editing.parsed.notes && (
                  <span className="text-xs italic text-muted-foreground">
                    {editing.parsed.notes}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="food_name">{t.logForm.photo.foodName}</Label>
                  <Input
                    id="food_name"
                    value={edited.food_name}
                    onChange={(e) => setField('food_name', e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="calories">{t.logForm.photo.calories}</Label>
                    <Input
                      id="calories"
                      type="number"
                      inputMode="numeric"
                      value={edited.calories}
                      onChange={(e) =>
                        setField('calories', Math.max(0, Number(e.target.value) || 0))
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="protein">{t.logForm.photo.protein}</Label>
                    <Input
                      id="protein"
                      type="number"
                      inputMode="numeric"
                      value={edited.protein}
                      onChange={(e) =>
                        setField('protein', Math.max(0, Number(e.target.value) || 0))
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="carbs">{t.logForm.photo.carbs}</Label>
                    <Input
                      id="carbs"
                      type="number"
                      inputMode="numeric"
                      value={edited.carbs}
                      onChange={(e) =>
                        setField('carbs', Math.max(0, Number(e.target.value) || 0))
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fat">{t.logForm.photo.fat}</Label>
                    <Input
                      id="fat"
                      type="number"
                      inputMode="numeric"
                      value={edited.fat}
                      onChange={(e) =>
                        setField('fat', Math.max(0, Number(e.target.value) || 0))
                      }
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeReview} disabled={saving}>
              {t.logForm.photo.cancel}
            </Button>
            <Button onClick={onSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editing?.savedLogId ? t.logForm.photo.updateRecord : t.logForm.photo.saveToToday}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
