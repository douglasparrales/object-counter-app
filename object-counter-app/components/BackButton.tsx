import { StyleSheet, TouchableOpacity, View, type TouchableOpacityProps } from 'react-native';

type Props = Omit<TouchableOpacityProps, 'children'>;

/** Shared return control; screens supply placement without redefining the icon. */
export default function BackButton({ style, accessibilityLabel = 'Volver', ...props }: Props) {
  return (
    <TouchableOpacity {...props} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7} hitSlop={6} style={[styles.button, style]}>
      <View style={styles.icon} pointerEvents="none"><View style={styles.chevron} /></View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { width: 46, height: 40, borderRadius: 24, backgroundColor: '#202934', alignItems: 'center', justifyContent: 'center' },
  icon: { width: 18, height: 20, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 9, height: 9, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#fff', transform: [{ translateX: 2 }, { rotate: '45deg' }] },
});
