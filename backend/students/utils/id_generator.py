# backend/students/utils/id_generator.py
class StudentIDGenerator:
    """Generate permanent student IDs in format: FS-YYYY-XXXXX"""
    
    def __init__(self):
        self.school_code = 'FS'
        
    def generate_student_id(self, existing_ids):
        """
        Generate a unique student ID
        Format: FS-2026-00001
        """
        import datetime
        current_year = datetime.datetime.now().year
        ethiopian_year = current_year - 8  # Approximate conversion
        
        # Find the highest sequence number
        max_seq = 0
        for existing_id in existing_ids:
            try:
                if existing_id and isinstance(existing_id, str):
                    parts = existing_id.split('-')
                    if len(parts) == 3:
                        seq = int(parts[2])
                        if seq > max_seq:
                            max_seq = seq
            except (ValueError, IndexError):
                continue
        
        # Generate next sequence
        next_seq = max_seq + 1
        padded_seq = str(next_seq).zfill(5)
        
        return f"{self.school_code}-{ethiopian_year}-{padded_seq}"