"""Add sharing enhancements and audit tables

Revision ID: 005_add_sharing_enhancements
Revises: 004_add_drive_service_models
Create Date: 2024-01-15

This migration adds:
- Password protection for share links
- Download limits for share links
- Share access logging
- File access auditing
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '005_add_sharing_enhancements'
down_revision = '004_add_drive_service_models'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to drive_shares table
    op.add_column('drive_shares', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('drive_shares', sa.Column('max_downloads', sa.Integer(), nullable=True))
    op.add_column('drive_shares', sa.Column('download_count', sa.Integer(), default=0, nullable=False, server_default='0'))
    
    # Create share_access_logs table
    op.create_table(
        'share_access_logs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('share_id', sa.Integer(), sa.ForeignKey('drive_shares.id'), nullable=False),
        sa.Column('access_type', sa.String(20), nullable=False),
        sa.Column('success', sa.Boolean(), default=True, nullable=False),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('referer', sa.String(500), nullable=True),
        sa.Column('country', sa.String(2), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=True),
    )
    
    # Create index on share_id for faster lookups
    op.create_index('ix_share_access_logs_share_id', 'share_access_logs', ['share_id'])
    op.create_index('ix_share_access_logs_created_at', 'share_access_logs', ['created_at'])
    
    # Create file_access_audits table
    op.create_table(
        'file_access_audits',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('file_id', sa.Integer(), sa.ForeignKey('drive_files.id'), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=True),
    )
    
    # Create indexes for file_access_audits
    op.create_index('ix_file_access_audits_user_id', 'file_access_audits', ['user_id'])
    op.create_index('ix_file_access_audits_file_id', 'file_access_audits', ['file_id'])
    op.create_index('ix_file_access_audits_action', 'file_access_audits', ['action'])
    op.create_index('ix_file_access_audits_created_at', 'file_access_audits', ['created_at'])


def downgrade():
    # Drop file_access_audits table
    op.drop_index('ix_file_access_audits_created_at', table_name='file_access_audits')
    op.drop_index('ix_file_access_audits_action', table_name='file_access_audits')
    op.drop_index('ix_file_access_audits_file_id', table_name='file_access_audits')
    op.drop_index('ix_file_access_audits_user_id', table_name='file_access_audits')
    op.drop_table('file_access_audits')
    
    # Drop share_access_logs table
    op.drop_index('ix_share_access_logs_created_at', table_name='share_access_logs')
    op.drop_index('ix_share_access_logs_share_id', table_name='share_access_logs')
    op.drop_table('share_access_logs')
    
    # Remove columns from drive_shares
    op.drop_column('drive_shares', 'download_count')
    op.drop_column('drive_shares', 'max_downloads')
    op.drop_column('drive_shares', 'password_hash')
