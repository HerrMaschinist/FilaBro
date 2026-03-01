import React, { ReactNode } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Pressable, PressableProps, ViewStyle } from "react-native";

interface PressableScaleProps extends Omit<PressableProps, "style"> {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  scaleDown?: number;
}

export function PressableScale({
  children,
  style,
  scaleDown = 0.97,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(scaleDown, { damping: 20, stiffness: 400 });
    opacity.value = withSpring(0.88, { damping: 20 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 16, stiffness: 280 });
    opacity.value = withSpring(1, { damping: 16 });
  };

  return (
    <Animated.View style={[style as ViewStyle, anim]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
