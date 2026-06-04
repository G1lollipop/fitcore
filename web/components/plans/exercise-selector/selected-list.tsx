'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableItem } from './sortable-item'
import type { SelectedExercise, SortableField } from './types'

interface SelectedListProps {
  exercises: SelectedExercise[]
  /** Receives the full reordered array (just `arrayMove` applied). */
  onReorder: (next: SelectedExercise[]) => void
  onRemove: (exerciseId: string) => void
  onUpdate: (exerciseId: string, field: SortableField, value: number) => void
}

/**
 * Right-hand panel of the selector. Wraps the picked-exercise list in a
 * dnd-kit context so items can be reordered. Owns the sensors + drag-end
 * handler; renders the empty state inline when nothing is selected.
 */
export function SelectedList({ exercises, onReorder, onRemove, onUpdate }: SelectedListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = exercises.findIndex((e) => e.exercise_id === active.id)
    const newIndex = exercises.findIndex((e) => e.exercise_id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(exercises, oldIndex, newIndex))
  }

  return (
    <div className="w-80 flex flex-col border-l border-border bg-secondary/30">
      <div className="p-4 border-b border-border shrink-0">
        <h4 className="font-medium text-foreground">已选动作</h4>
        <p className="text-xs text-muted-foreground mt-0.5">拖拽调整顺序 · 点击移除</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {exercises.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">还未选择动作</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={exercises.map((e) => e.exercise_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {exercises.map((exercise, index) => (
                  <SortableItem
                    key={exercise.exercise_id}
                    exercise={exercise}
                    index={index}
                    onRemove={() => onRemove(exercise.exercise_id)}
                    onUpdate={(field, value) => onUpdate(exercise.exercise_id, field, value)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
