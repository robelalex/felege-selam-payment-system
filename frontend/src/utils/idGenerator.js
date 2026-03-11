// src/utils/idGenerator.js
class StudentIDGenerator {
  constructor() {
    this.schoolCode = 'FS';
    // Get current year in Ethiopian calendar (approx)
    const date = new Date();
    this.currentYear = date.getFullYear();
    this.ethiopianYear = this.currentYear - 8; // Approximate conversion
  }

  /**
   * Generate a unique student ID
   * Format: FS-YYYY-XXXXX (e.g., FS-2016-00001)
   */
  generateStudentID(existingIds = []) {
    const year = this.ethiopianYear;
    
    // Find the next available sequence number
    let maxSeq = 0;
    
    existingIds.forEach(id => {
      if (id && typeof id === 'string') {
        const parts = id.split('-');
        if (parts.length === 3) {
          const seq = parseInt(parts[2]);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      }
    });
    
    const nextSeq = maxSeq + 1;
    const paddedSeq = nextSeq.toString().padStart(5, '0');
    return `${this.schoolCode}-${year}-${paddedSeq}`;
  }

  /**
   * Generate multiple IDs for bulk import
   */
  generateBulkIDs(count, existingIds = []) {
    const ids = [];
    let year = this.ethiopianYear;
    
    // Find max sequence
    let maxSeq = 0;
    existingIds.forEach(id => {
      if (id && typeof id === 'string') {
        const parts = id.split('-');
        if (parts.length === 3) {
          const seq = parseInt(parts[2]);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      }
    });
    
    let sequence = maxSeq + 1;
    
    for (let i = 0; i < count; i++) {
      const paddedSeq = sequence.toString().padStart(5, '0');
      const id = `${this.schoolCode}-${year}-${paddedSeq}`;
      ids.push(id);
      sequence++;
    }
    
    return ids;
  }
}

// Create a single instance to export
const idGenerator = new StudentIDGenerator();
export default idGenerator;