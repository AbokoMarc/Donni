import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Animated, PanResponder, View} from 'react-native';
import type {GestureResponderHandlers} from 'react-native';

interface ReorderableListProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, index: number, handle: GestureResponderHandlers, dragging: boolean) => React.ReactNode;
  disabled?: boolean;
}

/**
 * Liste réordonnable au doigt, sans dépendance native : la poignée de chaque ligne
 * déplace la ligne, les voisines s'écartent, le résultat n'est appliqué qu'au relâchement.
 */
export function ReorderableList<T>({items, keyOf, onReorder, renderItem, disabled}: ReorderableListProps<T>) {
  const heights = useRef<Record<string, number>>({});
  const [active, setActive] = useState<{index: number; target: number} | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const keyOfRef = useRef(keyOf);
  keyOfRef.current = keyOf;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const targetFor = useCallback((from: number, delta: number): number => {
    const list = itemsRef.current;
    let target = from;
    let travelled = 0;
    if (delta > 0) {
      for (let i = from + 1; i < list.length; i++) {
        const h = heights.current[keyOfRef.current(list[i])] ?? 0;
        if (delta > travelled + h / 2) {
          target = i;
          travelled += h;
        } else {
          break;
        }
      }
    } else {
      for (let i = from - 1; i >= 0; i--) {
        const h = heights.current[keyOfRef.current(list[i])] ?? 0;
        if (-delta > travelled + h / 2) {
          target = i;
          travelled += h;
        } else {
          break;
        }
      }
    }
    return target;
  }, []);

  const handlers = useMemo(() => {
    const cache = new Map<number, GestureResponderHandlers>();
    return (index: number): GestureResponderHandlers => {
      const existing = cache.get(index);
      if (existing) {
        return existing;
      }
      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dy.setValue(0);
          setActive({index, target: index});
        },
        onPanResponderMove: (_e, g) => {
          dy.setValue(g.dy);
          const target = targetFor(index, g.dy);
          setActive(prev => (prev && prev.target !== target ? {index, target} : prev));
        },
        onPanResponderRelease: (_e, g) => {
          const target = targetFor(index, g.dy);
          setActive(null);
          dy.setValue(0);
          if (target !== index) {
            onReorderRef.current(index, target);
          }
        },
        onPanResponderTerminate: () => {
          setActive(null);
          dy.setValue(0);
        },
      });
      cache.set(index, responder.panHandlers);
      return responder.panHandlers;
    };
  }, [disabled, dy, targetFor]);

  return (
    <View>
      {items.map((item, index) => {
        const key = keyOf(item);
        let offset = 0;
        if (active && active.index !== index) {
          const movedH = heights.current[keyOf(items[active.index])] ?? 0;
          if (active.index < index && index <= active.target) {
            offset = -movedH;
          } else if (active.index > index && index >= active.target) {
            offset = movedH;
          }
        }
        const dragging = active?.index === index;
        return (
          <Animated.View
            key={key}
            onLayout={e => {
              heights.current[key] = e.nativeEvent.layout.height;
            }}
            style={{
              zIndex: dragging ? 2 : 0,
              elevation: dragging ? 4 : 0,
              transform: [{translateY: dragging ? dy : offset}],
            }}>
            {renderItem(item, index, handlers(index), dragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}
