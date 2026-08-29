import React from 'react';

export function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('');
}

export function getAvatarColor(username) {
  const colors = ['avatar-blue', 'avatar-green', 'avatar-purple', 'avatar-amber'];
  if (!username) return colors[0];
  const charSum = username.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[charSum % colors.length];
}

export default function Avatar({ username, name, size = 'md', className = '' }) {
  const colorClass = getAvatarColor(username);
  const initials = getInitials(name);
  const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : '';

  return (
    <div className={`avatar ${colorClass} ${sizeClass} ${className}`}>
      {initials}
    </div>
  );
}
