import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TeamTask } from '../../features/projects/types';

type Props = {
  task: TeamTask;
  canManage: boolean;
  onEdit: () => void;
  onStatusChange: (status: TeamTask['status']) => void;
};

export function TeamTaskCard({ task, canManage, onEdit, onStatusChange }: Props) {
  const statusLabel =
    task.status === 'done'
      ? 'Done'
      : task.status === 'needs_more_time'
        ? 'Needs more time'
        : 'In progress';

  return (
    <View style={styles.card}>
      <View style={styles.details}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.deadline}>Due {task.deadline}</Text>
      </View>
      <Text
        style={[
          styles.status,
          task.status === 'done' && styles.done,
          task.status === 'needs_more_time' && styles.needsTime,
        ]}
      >
        {statusLabel}
      </Text>
      {canManage && (
        <View style={styles.actions}>
          <Pressable onPress={onEdit} accessibilityRole="button">
            <Text style={styles.action}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              onStatusChange(task.status === 'done' ? 'in_progress' : 'done')
            }
            accessibilityRole="button"
          >
            <Text style={styles.action}>
              {task.status === 'done' ? 'Reopen' : 'Done'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onStatusChange('needs_more_time')}
            accessibilityRole="button"
          >
            <Text style={styles.action}>Need more time</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECEDEF',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    color: '#202124',
    fontSize: 11,
    fontWeight: '600',
  },
  deadline: {
    color: '#777A80',
    fontSize: 9,
  },
  status: {
    color: '#777A80',
    fontSize: 9,
    marginTop: 6,
  },
  done: {
    color: '#17845D',
  },
  needsTime: {
    color: '#A76712',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
    marginTop: 10,
  },
  action: {
    color: '#202124',
    fontSize: 9,
    fontWeight: '700',
  },
});
