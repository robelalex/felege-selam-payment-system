// src/components/Layout/PageHeader.js
import React from 'react';
import { motion } from 'framer-motion';

const PageHeader = ({ title, subtitle, icon: Icon, actions }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          {Icon && (
            <div className="p-3 bg-primary-100 rounded-xl">
              <Icon className="h-8 w-8 text-primary-600" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-gray-600 mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center space-x-3">{actions}</div>}
      </div>
    </motion.div>
  );
};

export default PageHeader;