import { Link } from 'react-router-dom';
import { Badge } from './Badge';
import { Card } from './Card';
import { activityActionLabels } from '@/constants/activityTypes';
import type { Activity } from '@/types/auth.types';

const categoryTints = ['#97764D', '#232D36', '#6B7881', '#C7BBAB'];

function categoryTint(category: string): string {
  const order = ['authentication', 'reservation', 'finance', 'system'];
  const idx = order.indexOf(category);
  return categoryTints[idx >= 0 ? idx % categoryTints.length : categoryTints.length - 1];
}

interface ActivityFeedProps {
  activities: Activity[];
  showLink?: boolean;
}

export function ActivityFeed({ activities, showLink = false }: ActivityFeedProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {activities.map((activity) => (
        <div
          key={activity.id}
          style={{
            display: 'flex',
            gap: '12px',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #C7BBAB',
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: categoryTint(activity.category),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 700,
          }}>
            {activity.category.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#232D36' }}>
                {activityActionLabels[activity.action] || activity.action}
              </span>
              <span style={{ fontSize: '12px', color: '#6B7881' }}>{activity.createdAt}</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#6B7881' }}>{activity.description}</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
              <Badge variant="default" size="sm">{activity.userName}</Badge>
              <Badge variant="default" size="sm">{activity.category}</Badge>
              {showLink && activity.entityType && (
                <Link
                  to={`/dashboard/${activity.entityType === 'reservation' ? 'reservations' : activity.entityType}s/${activity.entityId}`}
                  style={{ fontSize: '12px', color: '#97764D', textDecoration: 'none', fontWeight: 600 }}
                >
                  View →
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
      {activities.length === 0 && (
        <Card style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6B7881', fontSize: '14px' }}>No activities found</p>
        </Card>
      )}
    </div>
  );
}
